"""Unit tests for the deterministic on-call decisions.

The pure decision helpers are tested directly; the handler tests patch Docker/HTTP boundaries with
deterministic fakes. The concurrency test coordinates with events, not sleeps, so it proves the
resolved-during-remediation window instead of hoping to hit it.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from responder import (
    API_SERVICE,
    DB_SERVICE,
    ContainerState,
    Responder,
    authorized,
    bind_addresses,
    choose_action,
    fingerprint,
    incident_id,
    parse_alertmanager_payload,
    sanitized_alert,
)


class AuthorizationTests(unittest.TestCase):
    def test_accepts_the_matching_bearer_token(self) -> None:
        self.assertTrue(authorized("Bearer s3cret", "s3cret"))

    def test_rejects_missing_wrong_and_malformed_headers(self) -> None:
        self.assertFalse(authorized(None, "s3cret"))
        self.assertFalse(authorized("Bearer other", "s3cret"))
        self.assertFalse(authorized("s3cret", "s3cret"))
        self.assertFalse(authorized("Bearer s3cret", ""))


class PayloadTests(unittest.TestCase):
    def test_rejects_non_object_payloads(self) -> None:
        with self.assertRaises(ValueError):
            parse_alertmanager_payload([])

    def test_rejects_missing_alerts(self) -> None:
        with self.assertRaises(ValueError):
            parse_alertmanager_payload({"version": "4"})

    def test_drops_non_object_alerts(self) -> None:
        payload = {"alerts": [{"status": "firing"}, "noise", 42]}
        self.assertEqual(len(parse_alertmanager_payload(payload)), 1)


class FingerprintTests(unittest.TestCase):
    def test_uses_alertmanager_fingerprint_when_present(self) -> None:
        self.assertEqual(fingerprint({"fingerprint": "0123456789abcdef"}), "0123456789abcdef")

    def test_normalises_hex_case(self) -> None:
        self.assertEqual(fingerprint({"fingerprint": "0123456789ABCDEF"}), "0123456789abcdef")

    def test_is_stable_and_label_sensitive(self) -> None:
        first = {"labels": {"alertname": "A", "journey": "publish"}}
        second = {"labels": {"journey": "publish", "alertname": "A"}}
        other = {"labels": {"alertname": "B", "journey": "publish"}}
        self.assertEqual(fingerprint(first), fingerprint(second))
        self.assertNotEqual(fingerprint(first), fingerprint(other))

    def test_rejects_path_traversal_and_non_hex_values(self) -> None:
        for bad in ("../../etc/passwd", "abc/def", "zzzzzzzz", "0123", "0" * 65):
            with self.subTest(value=bad), self.assertRaises(ValueError):
                fingerprint({"fingerprint": bad})

    def test_incident_id_rejects_paths(self) -> None:
        with self.assertRaises(ValueError):
            incident_id("../escape")


class DecisionTests(unittest.TestCase):
    healthy = ContainerState(running=True, health="healthy")
    stopped = ContainerState(running=False, health="missing")
    unhealthy = ContainerState(running=True, health="unhealthy")

    def test_database_is_repaired_before_the_api(self) -> None:
        self.assertEqual(
            choose_action("AetherPublish5xxRate", self.healthy, self.stopped),
            "restart_db",
        )

    def test_unhealthy_database_is_repaired(self) -> None:
        self.assertEqual(
            choose_action("AetherPublish5xxRate", self.healthy, self.unhealthy),
            "restart_db",
        )

    def test_unhealthy_api_is_rolled_back(self) -> None:
        self.assertEqual(
            choose_action("AetherApiDown", self.unhealthy, self.healthy),
            "rollback_api",
        )

    def test_healthy_pair_gets_a_restart(self) -> None:
        self.assertEqual(
            choose_action("AetherPublish5xxRate", self.healthy, self.healthy),
            "restart_api",
        )

    def test_container_without_healthcheck_is_usable(self) -> None:
        self.assertTrue(ContainerState(running=True, health="none").healthy)
        self.assertFalse(ContainerState(running=False, health="none").healthy)


class IncidentShapeTests(unittest.TestCase):
    def test_id_contains_a_timestamp_and_short_fingerprint(self) -> None:
        value = incident_id("0123456789abcdef")
        self.assertRegex(value, r"^\d{8}T\d{6}Z-01234567$")

    def test_sanitized_alert_keeps_only_operational_fields(self) -> None:
        alert = {
            "status": "firing",
            "labels": {
                "alertname": "AetherPublish5xxRate",
                "severity": "critical",
                "journey": "publish",
                "secret": "should-not-appear",
            },
            "annotations": {
                "summary": "Publish is failing",
                "description": "5xx",
                "runbook_url": "https://example.test/runbook",
                "secret": "should-not-appear",
            },
            "generatorURL": "http://prometheus/graph",
        }
        sanitized = sanitized_alert(alert)
        self.assertEqual(sanitized["name"], "AetherPublish5xxRate")
        self.assertEqual(sanitized["summary"], "Publish is failing")
        self.assertNotIn("secret", sanitized)
        self.assertNotIn("generatorURL", sanitized)


class BindTests(unittest.TestCase):
    def test_default_is_loopback_only(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(bind_addresses(), ["127.0.0.1"])

    def test_multiple_explicit_addresses_are_split(self) -> None:
        self.assertEqual(
            bind_addresses("127.0.0.1,172.17.0.1"),
            ["127.0.0.1", "172.17.0.1"],
        )

    def test_refuses_a_wildcard_listener(self) -> None:
        for value in ("0.0.0.0", "::", "[::]", "0:0:0:0:0:0:0:0", "127.0.0.1,0.0.0.0"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                bind_addresses(value)


class ResponderTestBase(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.incident_dir = Path(self.tempdir.name)
        patcher = patch("responder.INCIDENT_DIR", self.incident_dir)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.responder = Responder("test-token")
        # LIFO: join the workers, then delete the temporary directory, then remove the patch.
        self.addCleanup(self.tempdir.cleanup)
        self.addCleanup(self.responder.join_handlers)

    def record(self, incident: str) -> dict:
        return json.loads((self.incident_dir / f"{incident}.json").read_text(encoding="utf-8"))

    def wait_for_record(self, incident: str, predicate, timeout: float = 3.0) -> dict:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            path = self.incident_dir / f"{incident}.json"
            if path.exists():
                data = json.loads(path.read_text(encoding="utf-8"))
                if predicate(data):
                    return data
            time.sleep(0.01)
        self.fail(f"record {incident} did not reach the expected state")


class RestartTests(ResponderTestBase):
    def completed(self) -> subprocess.CompletedProcess:
        return subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")

    def test_running_container_is_restarted_not_up_noop(self) -> None:
        before = {"id": "abc", "startedAt": "2026-01-01T00:00:00Z"}
        after = {"id": "abc", "startedAt": "2026-01-01T00:10:00Z"}
        with (
            patch("responder.container_runtime", side_effect=[before, after]),
            patch("responder.compose", return_value=self.completed()) as compose,
            patch("responder.wait_for_health", return_value=ContainerState(True, "healthy")),
        ):
            result = self.responder._apply("restart_db")
        compose.assert_called_once_with("restart", DB_SERVICE)
        self.assertTrue(result["changed"])

    def test_missing_container_is_created(self) -> None:
        after = {"id": "new", "startedAt": "2026-01-01T00:10:00Z"}
        with (
            patch("responder.container_runtime", side_effect=[None, after]),
            patch("responder.compose", return_value=self.completed()) as compose,
            patch("responder.wait_for_health", return_value=ContainerState(True, "healthy")),
        ):
            result = self.responder._apply("restart_api")
        compose.assert_called_once_with("up", "-d", "--no-deps", API_SERVICE)
        self.assertTrue(result["changed"])

    def test_unchanged_runtime_is_not_reported_as_restarted(self) -> None:
        same = {"id": "abc", "startedAt": "2026-01-01T00:00:00Z"}
        with (
            patch("responder.container_runtime", side_effect=[same, dict(same)]),
            patch("responder.compose", return_value=self.completed()),
            patch("responder.wait_for_health", return_value=ContainerState(True, "healthy")),
        ):
            result = self.responder._apply("restart_api")
        self.assertFalse(result["changed"])


class HealthGateTests(ResponderTestBase):
    def test_gate_checks_the_service_the_action_targets(self) -> None:
        healthy = ContainerState(True, "healthy")
        unhealthy = ContainerState(True, "unhealthy")
        cases = [
            ("restart_db", healthy, unhealthy, "escalated"),
            # Regression: a healthy database must not mask an unhealthy API after rollback_api.
            ("rollback_api", unhealthy, healthy, "escalated"),
            ("rollback_api", healthy, healthy, "remediated"),
            ("restart_api", unhealthy, healthy, "escalated"),
        ]
        for index, (action, api, db, expected) in enumerate(cases):
            with self.subTest(action=action, api=api.health, db=db.health):
                responder = Responder("test-token")
                responder._apply = lambda _action: {"changed": True, "returnCode": 0}
                fp = f"0123456789abcde{index}"
                new_id = incident_id(fp)
                alert = {
                    "status": "firing",
                    "fingerprint": fp,
                    "labels": {"alertname": "AetherPublish5xxRate", "journey": "publish"},
                }

                def state(service: str, api=api, db=db) -> ContainerState:
                    return api if service == API_SERVICE else db

                with (
                    patch("responder.container_state", side_effect=state),
                    patch("responder.choose_action", return_value=action),
                    patch("responder.compose_logs", return_value=""),
                    patch.object(responder, "_github_issue", return_value=None),
                ):
                    responder._handle(alert, fp, new_id)
                self.assertEqual(self.record(new_id)["status"], expected)


class ResolvedRaceTests(ResponderTestBase):
    def alert(self, status: str = "firing") -> dict:
        return {
            "status": status,
            "fingerprint": "0123456789abcdef",
            "labels": {"alertname": "AetherPublish5xxRate", "journey": "publish"},
            "annotations": {"summary": "Publish is failing"},
        }

    def test_resolved_during_remediation_is_preserved(self) -> None:
        started = threading.Event()
        release = threading.Event()

        def fake_apply(_action: str) -> dict:
            started.set()
            if not release.wait(5):
                raise AssertionError("test timed out waiting for the resolved notification")
            return {"changed": True, "returnCode": 0}

        self.responder._apply = fake_apply
        with (
            patch("responder.container_state", return_value=ContainerState(True, "healthy")),
            patch("responder.compose_logs", return_value=""),
            patch.object(self.responder, "_github_issue", return_value=None),
        ):
            accepted = self.responder.accept({"alerts": [self.alert()]})
            self.assertEqual(accepted["accepted"], 1)
            self.assertTrue(started.wait(2), "handler never started remediation")
            resolved = self.responder.accept({"alerts": [self.alert("resolved")]})
            self.assertEqual(resolved["resolved"], 1)
            release.set()
            new_id = next(iter(self.responder._open.values()), None)
            # The incident id is discoverable from the single file the handler wrote.
            files = list(self.incident_dir.glob("*.json"))
            self.assertEqual(len(files), 1)
            data = self.wait_for_record(
                files[0].stem,
                lambda record: record.get("action", {}).get("returnCode") == 0,
            )
            self.responder.join_handlers()

        self.assertIsNone(new_id)
        self.assertEqual(data["status"], "resolved")
        self.assertIsNotNone(data["resolvedAt"])
        events = [entry["event"] for entry in data["history"]]
        self.assertIn("alertmanager_resolved", events)
        self.assertIn("remediation_healthy", events)

    def test_resolved_before_first_write_skips_remediation(self) -> None:
        fp = "0123456789abcdef"
        new_id = "20260101T000000Z-01234567"
        with self.responder._lock:
            self.responder._open[fp] = new_id
        self.responder._resolve(fp)
        with patch.object(
            self.responder, "_apply", side_effect=AssertionError("resolved alert must not remediate")
        ):
            self.responder._handle(self.alert(), fp, new_id)
        data = self.record(new_id)
        self.assertEqual(data["status"], "resolved")
        self.assertIsNotNone(data["resolvedAt"])

    def test_a_new_firing_after_resolution_is_accepted(self) -> None:
        fp = "0123456789abcdef"
        new_id = "20260101T000000Z-01234567"
        with self.responder._lock:
            self.responder._open[fp] = new_id
        self.responder._resolve(fp)
        # Registration only: this test is about the open/resolved state, not the remediation worker.
        accepted = self.responder.accept({"alerts": [self.alert()]}, dispatch=False)
        self.assertEqual(accepted["accepted"], 1)
        self.assertIn(fp, self.responder._open)
        self.assertNotIn(fp, self.responder._resolved)


if __name__ == "__main__":
    unittest.main()
