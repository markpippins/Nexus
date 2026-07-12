"""utterance_queue.py — Priority utterance queue with dedup.

Ensures that:
  - High-priority utterances are spoken first
  - Duplicate events are not spoken twice
  - Utterances are throttled (minimum gap between spoken utterances)
  - Old queued items are expired after a TTL
"""

from __future__ import annotations

import heapq
import sys
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any

from .projector import Utterance


# ── Configuration ───────────────────────────────────────────────────

# Minimum seconds between spoken utterances (anti-spam)
MIN_UTTERANCE_GAP_SECONDS: float = 2.0

# Maximum age of a queued utterance before it's dropped
MAX_QUEUE_AGE_SECONDS: float = 300.0  # 5 minutes

# Maximum queue size before oldest low-priority items are dropped
MAX_QUEUE_SIZE: int = 50


def _log(msg: str, *args: Any) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    print(f"[{ts}] [tts.queue] {msg % args}", file=sys.stderr, flush=True)


@dataclass(order=True)
class _QueuedUtterance:
    """Internal queue item with heap ordering.

    Heap ordering: higher priority first, then older first.
    Negate priority so max-heap behavior (Python heapq is min-heap).
    """

    sort_key: tuple[int, float]  # (-priority, enqueued_at)
    utterance: Utterance = field(compare=False)
    enqueued_at: float = field(compare=False)


class UtteranceQueue:
    """Thread-safe priority queue for utterances.

    Features:
      - Dedup by source_event_id (don't speak same event twice)
      - Priority ordering (10 = highest, 1 = lowest)
      - Throttling (minimum gap between utterances)
      - TTL expiration for stale items
      - Max size with LRU eviction of low-priority items
    """

    def __init__(self) -> None:
        self._heap: list[_QueuedUtterance] = []
        self._seen_ids: OrderedDict[str, None] = OrderedDict()
        self._seen_max: int = 500  # bounded LRU for dedup set
        self._last_spoken_at: float = 0.0
        self._lock = threading.Lock()

    def enqueue(self, utterance: Utterance) -> bool:
        """Add an utterance to the queue. Returns True if enqueued."""
        with self._lock:
            # Dedup by source event ID
            if (
                utterance.source_event_id
                and utterance.source_event_id in self._seen_ids
            ):
                _log("Dedup: already queued %s", utterance.source_event_id[:8])
                return False

            if utterance.source_event_id:
                self._seen_ids[utterance.source_event_id] = None

            # Evict if full (drop lowest priority)
            if len(self._heap) >= MAX_QUEUE_SIZE:
                self._evict_lowest()

            item = _QueuedUtterance(
                sort_key=(-utterance.priority, time.time()),
                utterance=utterance,
                enqueued_at=time.time(),
            )
            heapq.heappush(self._heap, item)
            _log(
                "Enqueued [p%d] '%s' (queue size: %d)",
                utterance.priority,
                utterance.text[:60],
                len(self._heap),
            )
            return True

    def dequeue(self) -> Utterance | None:
        """Get the next utterance to speak, or None if throttled/empty."""
        with self._lock:
            now = time.time()

            # Expire stale items
            self._expire_stale(now)

            if not self._heap:
                return None

            # Throttle check
            if now - self._last_spoken_at < MIN_UTTERANCE_GAP_SECONDS:
                return None

            item = heapq.heappop(self._heap)
            self._last_spoken_at = now

            _log(
                "Dequeued [p%d] '%s'",
                item.utterance.priority,
                item.utterance.text[:60],
            )
            return item.utterance

    def peek_next_delay(self) -> float:
        """Seconds until the next utterance can be spoken (0 = ready now)."""
        with self._lock:
            if not self._heap:
                return float("inf")
            elapsed = time.time() - self._last_spoken_at
            remaining = MIN_UTTERANCE_GAP_SECONDS - elapsed
            return max(0.0, remaining)

    def size(self) -> int:
        with self._lock:
            return len(self._heap)

    def clear(self) -> None:
        with self._lock:
            self._heap.clear()
            self._seen_ids.clear()

    def _expire_stale(self, now: float) -> None:
        """Remove items older than MAX_QUEUE_AGE_SECONDS."""
        cutoff = now - MAX_QUEUE_AGE_SECONDS
        before = len(self._heap)
        self._heap = [
            item
            for item in self._heap
            if item.enqueued_at > cutoff
        ]
        heapq.heapify(self._heap)
        dropped = before - len(self._heap)
        if dropped:
            _log("Expired %d stale utterance(s)", dropped)
        # Also prune the dedup set to its max size
        while len(self._seen_ids) > self._seen_max:
            self._seen_ids.popitem(last=False)  # evict oldest

    def _evict_lowest(self) -> None:
        """Evict the lowest-priority item (at the end of the heap)."""
        # Find the item with the lowest priority (max sort_key[0] since negated)
        lowest_idx = 0
        lowest_key = self._heap[0].sort_key

        for i, item in enumerate(self._heap):
            if item.sort_key > lowest_key:  # Higher = lower priority
                lowest_key = item.sort_key
                lowest_idx = i

        evicted = self._heap.pop(lowest_idx)
        heapq.heapify(self._heap)
        _log("Evicted low-priority: '%s'", evicted.utterance.text[:40])
