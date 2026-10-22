"""Unit tests for the deterministic on-call decisions.

They deliberately do not touch Docker: the HTTP handler and the compose commands are thin shells
around these functions, which is where the incident policy lives.
"""

from __future__ import annotations

import unittest

from responder import (
    ContainerState,
    authorized,
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
        self.assertEqual(fingerprint({"fingerprint": "abc123"}), "abc123")

    def test_is_stable_and_label_sensitive(self) -> None:
        first = {"labels": {"alertname": "A", "journey": "publish"}}
        second = {"labels": {"journey": "publish", "alertname": "A"}}
        other = {"labels": {"alertname": "B", "journey": "publish"}}
        self.assertEqual(fingerprint(first), fingerprint(second))
        self.assertNotEqual(fingerprint(first), fingerprint(other))


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


if __name__ == "__main__":
    unittest.main()
