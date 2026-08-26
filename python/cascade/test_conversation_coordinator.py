"""
cascade conformance: conversation-coordinator granular lease releases (#7) +
structured watch-close codes (#8).

Locks f0706646 #7/#8: the post-response coordinator resolves a DISTINCT
outcome per lease release path (revoked / exhausted / expired — the API
layer already persists `release_reason` on tackle.role_leases), and every
terminal outcome maps to a controlled close code persisted on
`duality.session_watches.closed_reason` (V130).

  AC1 — RELEASED + release_reason=revoked → CLOSED_LEASE_REVOKED
  AC2 — RELEASED + release_reason=exhausted → CLOSED_LEASE_EXHAUSTED
  AC3 — EXPIRED (or release_reason=expired) → CLOSED_LEASE_EXPIRED
  AC4 — Live-detected: budget exhausted → CLOSED_LEASE_EXHAUSTED;
        expires_at passed → CLOSED_LEASE_EXPIRED (no status change needed)
  AC5 — Legacy fallback: RELEASED/EXPIRED with no release_reason →
        aggregated CLOSED_LEASE (back-compat, reason carries detail)
  AC6 — close_code_for_outcome maps every terminal outcome to the V130
        controlled vocabulary; unknown → natural; CLOSED → natural,
        legacy CLOSED_LEASE → lease_expired (conservative).
  AC7 — All granular lease outcomes are terminal (is_terminal).

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/cascade/test_conversation_coordinator.py -v
"""

import os
import sys
import unittest

_SELF_DIR = os.path.dirname(os.path.abspath(__file__))
_NEXUS_PYTHON = os.path.abspath(os.path.join(_SELF_DIR, "..", ".."))
if _NEXUS_PYTHON not in sys.path:
    sys.path.insert(0, _NEXUS_PYTHON)

from cascade.conversation_coordinator import (                       # noqa: E402
    OUTCOME_CLOSED,
    OUTCOME_CLOSED_LEASE,
    OUTCOME_CLOSED_LEASE_EXHAUSTED,
    OUTCOME_CLOSED_LEASE_EXPIRED,
    OUTCOME_CLOSED_LEASE_REVOKED,
    OUTCOME_CLOSED_AGENT,
    OUTCOME_CLOSED_IDLE,
    OUTCOME_CLOSED_NATURAL,
    OUTCOME_CLOSED_TURNS,
    CLOSE_CODE_NATURAL,
    close_code_for_outcome,
    is_terminal,
    resolve_conversation_outcome,
)

WATCH = {
    "thread_id": "t1",
    "role": "engineer",
    "max_turns": 20,
    "turn_count": 0,
    "idle_timeout_ms": 300000,
    "last_activity": None,
    "status": "active",
}


def _lease(status="ACTIVE", budget=10, consumed=0, expires_at=None,
           release_reason=None):
    return {
        "status": status,
        "budget_units": budget,
        "consumed_units": consumed,
        "expires_at": expires_at,
        "release_reason": release_reason,
    }


class TestLeaseReleasePaths(unittest.TestCase):
    """#7 — the coordinator separates revoked / exhausted / expired."""

    def test_revoked(self):
        r = resolve_conversation_outcome(
            WATCH, _lease(status="RELEASED", release_reason="revoked"), None)
        self.assertEqual(r.outcome, OUTCOME_CLOSED_LEASE_REVOKED)
        self.assertIn("revoked", r.reason.lower())
        self.assertTrue(is_terminal(r.outcome))

    def test_exhausted_on_released(self):
        r = resolve_conversation_outcome(
            WATCH, _lease(status="RELEASED", release_reason="exhausted"), None)
        self.assertEqual(r.outcome, OUTCOME_CLOSED_LEASE_EXHAUSTED)
        self.assertTrue(is_terminal(r.outcome))

    def test_expired_status_released(self):
        r = resolve_conversation_outcome(
            WATCH, _lease(status="EXPIRED", release_reason="expired"), None)
        self.assertEqual(r.outcome, OUTCOME_CLOSED_LEASE_EXPIRED)
        self.assertTrue(is_terminal(r.outcome))

    def test_expired_reason_with_released_status(self):
        r = resolve_conversation_outcome(
            WATCH, _lease(status="RELEASED", release_reason="expired"), None)
        self.assertEqual(r.outcome, OUTCOME_CLOSED_LEASE_EXPIRED)

    def test_budget_exhaustion_active(self):
        r = resolve_conversation_outcome(
            WATCH, _lease(budget=10, consumed=10), None)
        self.assertEqual(r.outcome, OUTCOME_CLOSED_LEASE_EXHAUSTED)

    def test_clock_expiry_active(self):
        r = resolve_conversation_outcome(
            WATCH, _lease(expires_at="2020-01-01T00:00:00Z"), None)
        self.assertEqual(r.outcome, OUTCOME_CLOSED_LEASE_EXPIRED)


class TestLeaseLegacyFallback(unittest.TestCase):
    """#7 — rows without release_reason keep the legacy aggregate."""

    def test_released_no_reason_legacy(self):
        r = resolve_conversation_outcome(
            WATCH, _lease(status="RELEASED"), None)
        self.assertEqual(r.outcome, OUTCOME_CLOSED_LEASE)
        self.assertIn("RELEASED", r.reason)

    def test_expired_no_reason_still_expired(self):
        # EXPIRED status itself carries the expiry signal — no reason needed.
        r = resolve_conversation_outcome(
            WATCH, _lease(status="EXPIRED"), None)
        self.assertEqual(r.outcome, OUTCOME_CLOSED_LEASE_EXPIRED)


class TestCloseCodes(unittest.TestCase):
    """#8 — the structured close-code vocabulary (V130)."""

    def test_granular_lease_codes(self):
        self.assertEqual(
            close_code_for_outcome(OUTCOME_CLOSED_LEASE_REVOKED),
            "lease_revoked")
        self.assertEqual(
            close_code_for_outcome(OUTCOME_CLOSED_LEASE_EXHAUSTED),
            "lease_exhausted")
        self.assertEqual(
            close_code_for_outcome(OUTCOME_CLOSED_LEASE_EXPIRED),
            "lease_expired")

    def test_other_terminal_codes(self):
        self.assertEqual(close_code_for_outcome(OUTCOME_CLOSED_TURNS), "turns")
        self.assertEqual(close_code_for_outcome(OUTCOME_CLOSED_AGENT), "agent")
        self.assertEqual(close_code_for_outcome(OUTCOME_CLOSED_IDLE), "idle")
        self.assertEqual(
            close_code_for_outcome(OUTCOME_CLOSED_NATURAL), "natural")

    def test_legacy_aggregate_conservative(self):
        # No granularity carried → conservative fallbacks.
        self.assertEqual(close_code_for_outcome(OUTCOME_CLOSED_LEASE),
                         "lease_expired")
        self.assertEqual(close_code_for_outcome(OUTCOME_CLOSED),
                         "natural")

    def test_unknown_outcome_falls_back(self):
        self.assertEqual(close_code_for_outcome("BOGUS"), CLOSE_CODE_NATURAL)


if __name__ == "__main__":
    unittest.main(verbosity=2)