"""Binding authority-mode consult (G1 activation).

Read-only authority resolution for the narrowly-binding decision class
`deny_contract_promotion`, activated by the G1 gate (verdict 986ec482,
2026-09-02). The durable mode lives in peb.state (key
`binding_authority_mode`, written by migration V135); this module only
reads it and never writes.

Contract (mirrors the W4.06 fail-closed admission semantics):

- default when no state row exists  -> ``advisory`` (pre-activation and
  post-reversion behavior are identical — fail-safe)
- only ``deny_contract_promotion`` may carry ``narrowly_binding``;
  any other class found elevated is ignored and reported ``advisory``
  (fail-safe, never fail-open)
- DB/connection errors                -> ``advisory`` + a ``reason``
  (a broken consult must never widen authority)
- a short-lived TTL cache (default 30 s) keeps the consult off the hot
  path; ``refresh=True`` bypasses it. Reversion therefore propagates
  within TTL, or immediately when callers force a refresh.

This module holds no writers: reverting authority is a DB/state operation
(V135's state row back to ``advisory``), never a code change.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Mapping, Optional

ADVISORY = "advisory"
NARROWLY_BINDING = "narrowly_binding"
BINDING_DECISION_CLASS = "deny_contract_promotion"
STATE_KEY = "binding_authority_mode"

_DEFAULT_TTL_S = 30.0


@dataclass(frozen=True)
class AuthorityDecision:
    """Result of one authority consult. ``authority`` is the safe value."""

    decision_class: str
    authority: str
    state_version: Optional[int]
    reason: str
    consulted_at: float


class BindingAuthority:
    """Read-only consult over the durable authority-mode state row."""

    def __init__(self, fetch_state_row, ttl_s: float = _DEFAULT_TTL_S) -> None:
        """``fetch_state_row`` is a callable returning the raw peb.state row
        for ``STATE_KEY`` as a mapping (content, metadata, version, ...) or
        None when absent — e.g. ``store.get_state(STATE_KEY)``. Injected so
        this module stays storage-agnostic and trivially testable."""
        self._fetch = fetch_state_row
        self._ttl_s = ttl_s
        self._cache: Optional[AuthorityDecision] = None
        self._cache_at: float = 0.0

    def get_authority_level(self, decision_class: str, *, refresh: bool = False) -> AuthorityDecision:
        """Resolve the authority level for ``decision_class``. Never raises."""
        now = time.monotonic()
        if not refresh and self._cache is not None and (now - self._cache_at) < self._ttl_s:
            cached = self._cache
            if cached.decision_class == decision_class:
                return cached
            # Different class than the cached consult: resolve directly.
            return self._resolve(decision_class)

        decision = self._resolve(decision_class)
        self._cache = decision
        self._cache_at = now
        return decision

    # ── internals ────────────────────────────────────────────────────

    def _resolve(self, decision_class: str) -> AuthorityDecision:
        try:
            row = self._fetch()
        except Exception as exc:  # noqa: BLE001 — consult must never raise
            return AuthorityDecision(
                decision_class=decision_class,
                authority=ADVISORY,
                state_version=None,
                reason=f"state_lookup_error:{type(exc).__name__}",
                consulted_at=time.time(),
            )
        if row is None:
            return AuthorityDecision(
                decision_class=decision_class,
                authority=ADVISORY,
                state_version=None,
                reason="no_state_row",
                consulted_at=time.time(),
            )
        content = row.get("content") if isinstance(row, Mapping) else None
        version = row.get("version") if isinstance(row, Mapping) else None
        if not isinstance(content, Mapping):
            try:
                content = dict(content)  # tolerate jsonb already-decoded dicts
            except Exception:  # noqa: BLE001
                content = None
        if not isinstance(content, Mapping):
            return AuthorityDecision(
                decision_class=decision_class,
                authority=ADVISORY,
                state_version=version if isinstance(version, int) else None,
                reason="malformed_state_content",
                consulted_at=time.time(),
            )
        if content.get("decision_class") != decision_class:
            # The elevated class is not this class — advisory for the caller.
            return AuthorityDecision(
                decision_class=decision_class,
                authority=ADVISORY,
                state_version=version if isinstance(version, int) else None,
                reason="class_not_elevated",
                consulted_at=time.time(),
            )
        level = content.get("authority_level")
        if level == NARROWLY_BINDING and decision_class == BINDING_DECISION_CLASS:
            return AuthorityDecision(
                decision_class=decision_class,
                authority=NARROWLY_BINDING,
                state_version=version if isinstance(version, int) else None,
                reason="state_row",
                consulted_at=time.time(),
            )
        # advisory row (pre-activation/reverted), unknown level, or a class
        # other than the binding class — all advisory (fail-safe).
        return AuthorityDecision(
            decision_class=decision_class,
            authority=ADVISORY,
            state_version=version if isinstance(version, int) else None,
            reason="advisory_mode",
            consulted_at=time.time(),
        )


def state_row_fetcher(connection_factory):
    """Adapter turning a DB connection factory into the callable shape
    ``BindingAuthority`` expects. Returns the peb.state row for the
    authority key as a mapping, or None."""

    def fetch() -> Optional[Mapping[str, Any]]:
        conn = connection_factory()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT content, metadata, checksum, version FROM peb.state WHERE key = %s",
                (STATE_KEY,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            keys = ("content", "metadata", "checksum", "version")
            return dict(zip(keys, row))
        finally:
            conn.close()

    return fetch
