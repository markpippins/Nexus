"""Scheduler — deterministic main loop: poll → work surface → arbitration → dispatch.

Ties together WorkSurface, LeasePool, ArbitrationEngine, and Dispatcher
into a deterministic event processing loop.  Same input → same output.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .work_surface import WorkSurface, WorkSurfaceEntry, WorkSurfaceStatus
from .lease_pool import LeasePool
from .arbitration_engine import ArbitrationEngine
from .dispatcher import Dispatcher, DispatchEvent


@dataclass
class Scheduler:
    """Deterministic event processing loop.

    Main cycle:
    1. Ingest new events → WorkSurface (with PromotionReceipts)
    2. For each unassigned entry:
       a. Get idle leases from LeasePool
       b. Select best lease via ArbitrationEngine (argmax)
       c. Dispatch event → lease (with PromotionReceipt)
    3. Retry deferred entries whose time has come
    4. Monitor capacity and preemption

    Determinism guarantee: given identical WorkSurface + LeasePool
    state and identical event sources, produces identical dispatch
    order (argmax, sorted unassigned by priority+epoch).
    """

    work_surface: WorkSurface = field(default_factory=WorkSurface)
    lease_pool: LeasePool = field(default_factory=LeasePool)
    arbitration: ArbitrationEngine = field(default_factory=ArbitrationEngine)
    dispatcher: Dispatcher | None = None
    running: bool = False

    def __post_init__(self):
        if self.dispatcher is None:
            self.dispatcher = Dispatcher(
                work_surface=self.work_surface,
                lease_pool=self.lease_pool,
            )

    # ── ingest ─────────────────────────────────────────────────────

    def ingest(self, events: list[Any]) -> list[WorkSurfaceEntry]:
        """Add events to the WorkSurface. Returns created entries."""
        entries: list[WorkSurfaceEntry] = []
        for event in events:
            entry = self.work_surface.add(event)
            entries.append(entry)
        return entries

    # ── process cycle ──────────────────────────────────────────────

    def process_unassigned(self) -> list[DispatchEvent]:
        """Process all unassigned entries: arbitrate and dispatch."""
        dispatched: list[DispatchEvent] = []

        for entry in self.work_surface.unassigned():
            idle_slots = self.lease_pool.idle_slots()

            if not idle_slots:
                self.work_surface.defer(entry.entry_id, "no_idle_leases")
                continue

            best_lease, best_score = self.arbitration.select_with_load(
                idle_slots, entry
            )

            if best_lease is None:
                self.work_surface.defer(entry.entry_id, "policy_denied")
                continue

            de = self.dispatcher.dispatch(entry, best_lease, best_score)
            if de is not None:
                dispatched.append(de)

        return dispatched

    def process_deferred(self) -> None:
        """Retry deferred entries whose time has come."""
        for entry in self.work_surface.deferred_due():
            self.work_surface.retry(entry.entry_id)

    def process_preemption(self, event: Any) -> str | None:
        """Check if a high-priority event should preempt an active lease.

        Returns the preempted event_id to requeue, or None.
        """
        priority = getattr(event, "priority", 0.5)
        target = self.lease_pool.find_preemption_target(priority)
        if target:
            return self.lease_pool.preempt(target)
        return None

    # ── main loop ──────────────────────────────────────────────────

    def cycle(self, events: list[Any] | None = None) -> dict:
        """Run one processing cycle.

        Args:
            events: New events to ingest (optional).

        Returns:
            Telemetry dict with counts for this cycle.
        """
        if events:
            self.ingest(events)

        # Process preemption on unassigned entries
        for entry in self.work_surface.unassigned():
            reqd = self.process_preemption(entry)
            if reqd:
                # Re-add the preempted event as unassigned
                self.work_surface.retry(reqd)

        # Process unassigned
        de = self.process_unassigned()

        # Retry deferred
        self.process_deferred()

        return {
            "cycle_unassigned": self.work_surface.unassigned_count,
            "cycle_deferred": self.work_surface.deferred_count,
            "cycle_dispatched": len(de),
            "pool_active": self.lease_pool.active_count,
            "pool_idle": self.lease_pool.idle_count,
        }

    def run(self, event_source: Any, cycle_count: int | None = None) -> list[dict]:
        """Run the main loop, polling an event source.

        The event source must have a poll() method returning list[Any].

        Args:
            event_source: Object with poll() → list[Any].
            cycle_count: Max cycles to run (None = run until empty source).

        Returns:
            List of telemetry dicts, one per cycle.
        """
        self.running = True
        telemetry: list[dict] = []
        cycles = 0

        while self.running:
            events = getattr(event_source, "poll", lambda: [])()
            if not events and not self.work_surface.unassigned():
                break

            t = self.cycle(events)
            telemetry.append(t)
            cycles += 1

            if cycle_count is not None and cycles >= cycle_count:
                break

        self.running = False
        return telemetry

    # ── telemetry ──────────────────────────────────────────────────

    def telemetry(self) -> dict:
        """Full scheduler telemetry snapshot."""
        return {
            "work_surface": {
                "total": self.work_surface.entry_count,
                "unassigned": self.work_surface.unassigned_count,
                "deferred": self.work_surface.deferred_count,
            },
            "lease_pool": self.lease_pool.telemetry(),
        }
