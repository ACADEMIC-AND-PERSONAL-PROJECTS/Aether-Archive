#!/usr/bin/env python3
"""Aether Archive on-call responder.

The responder is deliberately small and deterministic. Alertmanager posts every critical alert to
`POST /alerts`; the responder inspects the running compose stack, chooses one remediation, applies it,
waits for Docker health, and writes an incident record under `oncall/incidents/`. A later `resolved`
notification closes the record.

Why a host process instead of a container: the responder must be able to restart the API, PostgreSQL
and, on a bad deploy, roll the API back to the last image known to be healthy. Mounting a writable
Docker socket into a public-facing service would give that service root-equivalent power. Running it
on the host, reachable only through Docker's host gateway and a bearer token, keeps the trade-off
explicit. The design is recorded in ADR-029.

The module is import-safe: the HTTP server only starts under `__main__`, which lets the pure decision
functions be unit-tested without Docker.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import shlex
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

LOG = logging.getLogger("aether.oncall")

ROOT = Path(os.environ.get("AETHER_REPO_DIR", Path(__file__).resolve().parent.parent)).resolve()
STATE_DIR = ROOT / "state"
INCIDENT_DIR = ROOT / "oncall" / "incidents"
COMPOSE_ARGS = shlex.split(
    os.environ.get(
        "AETHER_COMPOSE_ARGS",
        "-f docker-compose.yml -f docker-compose.observability.yml",
    )
)
API_SERVICE = os.environ.get("AETHER_API_SERVICE", "api")
DB_SERVICE = os.environ.get("AETHER_DB_SERVICE", "db")
MAX_BODY_BYTES = 1_000_000
LOG_EXCERPT_CHARS = 8_000
FINGERPRINT_RE = re.compile(r"^[0-9a-fA-F]{8,64}$")

# The health gate must check the service the action was meant to repair. A rollback that leaves the
# API unhealthy must never be recorded as remediation just because PostgreSQL is up.
HEALTH_TARGET = {
    "restart_db": DB_SERVICE,
    "restart_api": API_SERVICE,
    "rollback_api": API_SERVICE,
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def fingerprint(alert: dict[str, Any]) -> str:
    """Stable id for an alert, matching Alertmanager when it supplies one.

    Alertmanager fingerprints are hexadecimal. Rejecting anything else also protects the incident
    filename (`incident_id` uses the first eight characters) from path traversal.
    """
    supplied = str(alert.get("fingerprint") or "").strip()
    if supplied:
        if not FINGERPRINT_RE.fullmatch(supplied):
            raise ValueError("fingerprint must be 8-64 hexadecimal characters")
        return supplied.lower()
    labels = alert.get("labels") or {}
    canonical = json.dumps(labels, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def authorized(header: str | None, token: str) -> bool:
    if not header or not token:
        return False
    prefix = "Bearer "
    if not header.startswith(prefix):
        return False
    return hmac.compare_digest(header[len(prefix) :].strip(), token)


def alert_name(alert: dict[str, Any]) -> str:
    return str((alert.get("labels") or {}).get("alertname", "unknown"))


def alert_journey(alert: dict[str, Any]) -> str:
    return str((alert.get("labels") or {}).get("journey", "unknown"))


def parse_alertmanager_payload(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")
    alerts = payload.get("alerts")
    if not isinstance(alerts, list):
        raise ValueError("payload.alerts must be a list")
    parsed: list[dict[str, Any]] = []
    for alert in alerts:
        if isinstance(alert, dict):
            parsed.append(alert)
    return parsed


@dataclass(frozen=True)
class ContainerState:
    running: bool
    health: str

    @property
    def healthy(self) -> bool:
        # A container without a healthcheck is considered usable; the API and the database both
        # define one, so the distinction only matters for future services.
        return self.running and self.health in {"healthy", "none", ""}


def choose_action(alertname: str, api: ContainerState, db: ContainerState) -> str:
    """Pick one deterministic remediation for the observed state.

    The ordering is intentional: a missing database explains most publish failures, so it is
    repaired before we touch the API. A stopped API is next. A healthy pair under a publish alert
    means the process is wedged or a dependency is flapping; restarting the API is the least
    destructive next step. The database is never rolled back automatically.
    """
    if not db.healthy:
        return "restart_db"
    if not api.healthy:
        return "rollback_api"
    if alertname == "AetherApiDown":
        return "restart_api"
    return "restart_api"


def incident_id(fp: str) -> str:
    if not FINGERPRINT_RE.fullmatch(fp):
        raise ValueError("fingerprint must be 8-64 hexadecimal characters")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{stamp}-{fp[:8]}"


def sanitized_alert(alert: dict[str, Any]) -> dict[str, Any]:
    labels = alert.get("labels") or {}
    annotations = alert.get("annotations") or {}
    return {
        "name": str(labels.get("alertname", "unknown")),
        "severity": str(labels.get("severity", "unknown")),
        "journey": str(labels.get("journey", "unknown")),
        "status": str(alert.get("status", "unknown")),
        "startsAt": str(alert.get("startsAt", "")),
        "endsAt": str(alert.get("endsAt", "")),
        "summary": str(annotations.get("summary", "")),
        "description": str(annotations.get("description", "")),
        "runbook": str(annotations.get("runbook_url", "")),
    }


def compose(*args: str, env: dict[str, str] | None = None, timeout: int = 180) -> subprocess.CompletedProcess[str]:
    command = ["docker", "compose", *COMPOSE_ARGS, *args]
    merged = os.environ.copy()
    if env:
        merged.update(env)
    return subprocess.run(
        command,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=timeout,
        env=merged,
        check=False,
    )


def container_state(service: str) -> ContainerState:
    ids = compose("ps", "-q", service, timeout=30)
    container_id = ids.stdout.strip().splitlines()
    if not container_id:
        return ContainerState(running=False, health="missing")
    inspect = subprocess.run(
        [
            "docker",
            "inspect",
            "--format",
            "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}",
            container_id[0],
        ],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if inspect.returncode != 0:
        return ContainerState(running=False, health="unknown")
    status, _, health = inspect.stdout.strip().partition("|")
    return ContainerState(running=status == "running", health=health or "none")


def container_runtime(service: str) -> dict[str, str] | None:
    """Return the container id and start timestamp, including stopped containers.

    `docker compose up -d --no-deps svc` is a no-op for a container that already exists, even when
    it is unhealthy. The responder therefore restarts existing containers and uses this snapshot to
    prove that the process actually restarted (same id, new StartedAt) or was recreated (new id).
    """
    ids = compose("ps", "-a", "-q", service, timeout=30)
    container_id = ids.stdout.strip().splitlines()
    if not container_id:
        return None
    inspect = subprocess.run(
        ["docker", "inspect", "--format", "{{.Id}}|{{.State.StartedAt}}", container_id[0]],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if inspect.returncode != 0:
        return None
    cid, _, started_at = inspect.stdout.strip().partition("|")
    if not cid:
        return None
    return {"id": cid, "startedAt": started_at}


def runtime_changed(before: dict[str, str] | None, after: dict[str, str] | None) -> bool:
    if after is None:
        return False
    if before is None:
        return True
    return before.get("id") != after.get("id") or before.get("startedAt") != after.get("startedAt")


def compose_logs(service: str, tail: int = 60) -> str:
    result = compose("logs", "--no-color", "--tail", str(tail), service, timeout=60)
    text = (result.stdout or "") + (result.stderr or "")
    return text[-LOG_EXCERPT_CHARS:]


def wait_for_health(service: str, timeout_seconds: int = 120) -> ContainerState:
    deadline = time.monotonic() + timeout_seconds
    state = container_state(service)
    while time.monotonic() < deadline:
        state = container_state(service)
        if state.healthy:
            return state
        time.sleep(3)
    return state


def read_last_good_image() -> str | None:
    path = STATE_DIR / "last-good-image"
    try:
        value = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return value or None


class Responder:
    def __init__(self, token: str) -> None:
        self.token = token
        self._lock = threading.Lock()
        self._open: dict[str, str] = {}
        # Fingerprints resolved while a handler was still starting or remediating. The handler must
        # not resurrect the record after Alertmanager has closed it. A new firing clears the marker.
        self._resolved: set[str] = set()
        self._load_open_incidents()

    def _load_open_incidents(self) -> None:
        INCIDENT_DIR.mkdir(parents=True, exist_ok=True)
        for path in sorted(INCIDENT_DIR.glob("*.json")):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if data.get("status") in {"resolved"}:
                continue
            fp = str(data.get("fingerprint", ""))
            if fp:
                self._open[fp] = str(data.get("id", path.stem))

    def accept(self, payload: Any) -> dict[str, int]:
        alerts = parse_alertmanager_payload(payload)
        accepted = 0
        resolved = 0
        for alert in alerts:
            fp = fingerprint(alert)
            status = str(alert.get("status", "")).lower()
            if status == "resolved":
                self._resolve(fp)
                resolved += 1
                continue
            with self._lock:
                if fp in self._open:
                    continue
                self._resolved.discard(fp)
                new_id = incident_id(fp)
                self._open[fp] = new_id
            accepted += 1
            thread = threading.Thread(
                target=self._handle, args=(alert, fp, new_id), daemon=True, name=f"incident-{new_id}"
            )
            thread.start()
        return {"accepted": accepted, "resolved": resolved}

    def _resolve(self, fp: str) -> None:
        with self._lock:
            incident = self._open.pop(fp, None)
            if not incident:
                return
            self._resolved.add(fp)
            path = INCIDENT_DIR / f"{incident}.json"
            # The handler may not have written its first version yet. Create the final record now;
            # _handle checks _resolved before writing and will not remediate a resolved alert.
            data = self._read_incident(path) or {
                "id": incident,
                "fingerprint": fp,
                "status": "resolved",
                "receivedAt": utc_now(),
                "alert": {},
                "diagnosis": {},
                "action": {},
                "history": [],
                "resolvedAt": None,
                "githubIssue": None,
            }
            data["status"] = "resolved"
            data["resolvedAt"] = utc_now()
            data.setdefault("history", []).append({"at": utc_now(), "event": "alertmanager_resolved"})
            self._write_incident(path, data)
        LOG.info("incident resolved id=%s", incident)

    def _read_incident(self, path: Path) -> dict[str, Any] | None:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        return data if isinstance(data, dict) else None

    def _handle(self, alert: dict[str, Any], fp: str, new_id: str) -> None:
        name = alert_name(alert)
        LOG.info("incident received id=%s alert=%s", new_id, name)
        with self._lock:
            if fp in self._resolved:
                LOG.info("incident already resolved before remediation id=%s", new_id)
                return
        try:
            api = container_state(API_SERVICE)
            db = container_state(DB_SERVICE)
            action = choose_action(name, api, db)
            diagnosis = {
                "api": api.__dict__,
                "db": db.__dict__,
                "logExcerpt": compose_logs(API_SERVICE),
            }
            record: dict[str, Any] = {
                "id": new_id,
                "fingerprint": fp,
                "status": "remediating",
                "receivedAt": utc_now(),
                "alert": sanitized_alert(alert),
                "diagnosis": diagnosis,
                "action": {"kind": action, "startedAt": utc_now()},
                "history": [
                    {"at": utc_now(), "event": "received"},
                    {"at": utc_now(), "event": f"diagnosed:{action}"},
                ],
                "resolvedAt": None,
                "githubIssue": None,
            }
            path = INCIDENT_DIR / f"{new_id}.json"
            with self._lock:
                if fp in self._resolved:
                    LOG.info("incident already resolved before remediation id=%s", new_id)
                    return
                self._write_incident(path, record)

            result = self._apply(action)
            record["action"].update(result)
            record["action"]["finishedAt"] = utc_now()
            healthy = container_state(HEALTH_TARGET[action]).healthy
            applied = bool(result.get("changed", True))
            with self._lock:
                # _resolve may have closed the record while _apply was running. Never overwrite
                # that state or drop its history; merge the remediation result into the resolved
                # record instead.
                current = self._read_incident(path) or record
                current.setdefault("action", {}).update(record["action"])
                current.setdefault("history", []).append(
                    {"at": utc_now(), "event": f"remediation_{'healthy' if healthy else 'unhealthy'}"}
                )
                if not applied:
                    current["history"].append({"at": utc_now(), "event": "remediation_not_applied"})
                if current.get("status") != "resolved":
                    current["status"] = "remediated" if healthy and applied else "escalated"
                self._write_incident(path, current)
            issue = self._github_issue(current)
            if issue:
                with self._lock:
                    latest = self._read_incident(path) or current
                    latest["githubIssue"] = issue
                    self._write_incident(path, latest)
            LOG.info("incident %s status=%s action=%s", new_id, current["status"], action)
        except Exception:  # noqa: BLE001 - an on-call worker must never kill the server
            LOG.exception("incident handler failed id=%s", new_id)
            path = INCIDENT_DIR / f"{new_id}.json"
            with self._lock:
                data = self._read_incident(path) or {
                    "id": new_id,
                    "fingerprint": fp,
                    "alert": sanitized_alert(alert),
                    "history": [],
                }
                if data.get("status") != "resolved":
                    data["status"] = "escalated"
                data["error"] = "handler_failed"
                data.setdefault("history", []).append({"at": utc_now(), "event": "handler_failed"})
                self._write_incident(path, data)

    def _restart(self, service: str, timeout_seconds: int) -> dict[str, Any]:
        """Restart a service and prove that the container's process actually restarted.

        `compose up -d --no-deps` leaves an existing unhealthy container untouched. When a container
        exists (running or stopped), `compose restart` stops and starts it; when it does not exist,
        `up -d` creates it. The before/after identity is recorded so a no-op cannot be reported as
        remediation.
        """
        before = container_runtime(service)
        command = ["up", "-d", "--no-deps", service] if before is None else ["restart", service]
        result = compose(*command)
        after = container_runtime(service)
        state = wait_for_health(service, timeout_seconds=timeout_seconds)
        return {
            "command": "docker compose " + " ".join([*COMPOSE_ARGS, *command]),
            "returnCode": result.returncode,
            "serviceHealth": state.__dict__,
            "before": before,
            "after": after,
            "changed": runtime_changed(before, after),
            "output": (result.stdout + result.stderr)[-2000:],
        }

    def _apply(self, action: str) -> dict[str, Any]:
        if action == "restart_db":
            return self._restart(DB_SERVICE, timeout_seconds=120)
        if action == "rollback_api":
            image = read_last_good_image()
            if not image:
                result = self._restart(API_SERVICE, timeout_seconds=180)
                result["image"] = "current"
                return result
            before = container_runtime(API_SERVICE)
            # A different image requires a new container, not a restart of the broken one.
            command = ["up", "-d", "--no-deps", "--force-recreate", API_SERVICE]
            result = compose(*command, env={"AETHER_API_IMAGE": image})
            after = container_runtime(API_SERVICE)
            state = wait_for_health(API_SERVICE, timeout_seconds=180)
            return {
                "command": "docker compose " + " ".join([*COMPOSE_ARGS, *command]),
                "image": image,
                "returnCode": result.returncode,
                "serviceHealth": state.__dict__,
                "before": before,
                "after": after,
                "changed": runtime_changed(before, after),
                "output": (result.stdout + result.stderr)[-2000:],
            }
        if action == "restart_api":
            return self._restart(API_SERVICE, timeout_seconds=180)
        raise ValueError(f"unknown action: {action}")

    def _write_incident(self, path: Path, data: dict[str, Any]) -> None:
        INCIDENT_DIR.mkdir(parents=True, exist_ok=True)
        temp = path.with_suffix(".json.tmp")
        temp.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        temp.replace(path)

    def _github_issue(self, record: dict[str, Any]) -> str | None:
        token = os.environ.get("ONCALL_GITHUB_TOKEN")
        repo = os.environ.get("ONCALL_GITHUB_REPOSITORY")
        if not token or not repo:
            return None
        title = f"[on-call] {record['alert']['name']} — {record['alert']['summary'][:80]}"
        body = (
            f"Incident `{record['id']}` was handled by the deterministic on-call responder.\n\n"
            f"- status: **{record['status']}**\n"
            f"- action: `{record['action']['kind']}`\n"
            f"- received: `{record['receivedAt']}`\n"
            f"- journey: `{record['alert']['journey']}`\n"
            f"- evidence: `oncall/incidents/{record['id']}.json`\n\n"
            "No credentials, request bodies or image content are included in this report."
        )
        request = urllib.request.Request(
            f"https://api.github.com/repos/{repo}/issues",
            data=json.dumps({"title": title, "body": body}).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "aether-oncall/1.0",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                data = json.load(response)
            return str(data.get("html_url")) if isinstance(data, dict) else None
        except (urllib.error.URLError, OSError, ValueError):
            LOG.warning("GitHub issue creation failed for %s", record["id"])
            return None


class OnCallHandler(BaseHTTPRequestHandler):
    server_version = "aether-oncall/1.0"

    @property
    def responder(self) -> Responder:
        return self.server.responder  # type: ignore[attr-defined]

    def log_message(self, fmt: str, *args: Any) -> None:
        LOG.info("%s - %s", self.address_string(), fmt % args)

    def _json(self, status: int, body: dict[str, Any]) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _authenticated(self) -> bool:
        if authorized(self.headers.get("Authorization"), self.responder.token):
            return True
        self._json(401, {"error": "unauthorized"})
        return False

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        if self.path == "/healthz":
            self._json(200, {"status": "ok", "service": "aether-oncall"})
            return
        if self.path == "/incidents":
            if not self._authenticated():
                return
            incidents = []
            for path in sorted(INCIDENT_DIR.glob("*.json"), reverse=True)[:20]:
                try:
                    incidents.append(json.loads(path.read_text(encoding="utf-8")))
                except (OSError, json.JSONDecodeError):
                    continue
            self._json(200, {"incidents": incidents})
            return
        self._json(404, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        if self.path != "/alerts":
            self._json(404, {"error": "not_found"})
            return
        if not self._authenticated():
            return
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            self._json(400, {"error": "invalid_body_size"})
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw)
            accepted = self.responder.accept(payload)
        except (json.JSONDecodeError, ValueError) as error:
            self._json(400, {"error": "invalid_payload", "detail": str(error)})
            return
        self._json(202, accepted)


def bind_addresses(value: str | None = None) -> list[str]:
    """Explicit listen addresses. Never default to 0.0.0.0: the token is a plain bearer token."""
    raw = value if value is not None else os.environ.get("ONCALL_BIND", "127.0.0.1")
    return [address.strip() for address in raw.split(",") if address.strip()]


def main() -> int:
    logging.basicConfig(
        level=os.environ.get("ONCALL_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    token = os.environ.get("ONCALL_WEBHOOK_TOKEN", "").strip()
    if not token:
        LOG.error("ONCALL_WEBHOOK_TOKEN is required; refusing to start")
        return 2
    addresses = bind_addresses()
    if not addresses:
        LOG.error("ONCALL_BIND must contain at least one address")
        return 2
    port = int(os.environ.get("ONCALL_PORT", "9099"))
    INCIDENT_DIR.mkdir(parents=True, exist_ok=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    responder = Responder(token)
    servers: list[tuple[str, ThreadingHTTPServer]] = []
    for address in addresses:
        try:
            server = ThreadingHTTPServer((address, port), OnCallHandler)
        except OSError as error:
            LOG.error("could not bind %s:%s: %s", address, port, error)
            for _, existing in servers:
                existing.server_close()
            return 2
        server.daemon_threads = True
        server.responder = responder  # type: ignore[attr-defined]
        servers.append((address, server))
    for address, server in servers[1:]:
        threading.Thread(
            target=server.serve_forever, daemon=True, name=f"http-{address}"
        ).start()
    LOG.info(
        "aether-oncall listening on %s:%s (compose: %s)",
        ",".join(addresses),
        port,
        " ".join(COMPOSE_ARGS),
    )
    try:
        servers[0][1].serve_forever()
    except KeyboardInterrupt:
        LOG.info("aether-oncall stopping")
    finally:
        for _, server in servers:
            server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
