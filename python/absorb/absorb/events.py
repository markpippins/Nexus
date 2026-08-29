"""Cascade event emission for absorb (plan 0003) — facade over emitter.py.

This module previously inserted absorb lifecycle events *directly* into the
``cascade.events`` DB table. As of 2026-08-29 the canonical path is the NATS
cascade bus: absorb publishes `nexus.absorb.v1.<event_type>` envelopes via
:mod:`absorb.emitter` (single-writer), and :mod:`absorb.bus_mirror` projects
them into ``cascade.events`` (DB) so the existing
``cascade.events -> cascade-pg-bridge -> Redis -> SSE`` display path keeps
working.

This file is kept as a thin re-export facade so existing importers
(``cli.py`` ``from . import events as ev``, ``runner.py``
``from .events import ...``) keep resolving the same ``emit_*`` API. New code
should import from :mod:`absorb.emitter` directly.
"""

from __future__ import annotations

from .emitter import (                       # noqa: F401  (re-exported API)
    DOMAIN,
    emit_event,
    emit_run_completed,
    emit_run_started,
    emit_source_completed,
    emit_step_failed,
)