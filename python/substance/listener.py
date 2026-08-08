"""PostgreSQL LISTEN/NOTIFY listener for segment expiration.

When a segments_history row is superseded (expiration_dt changed from the
sentinel 9999-12-31 to now()), a DB trigger emits:

    pg_notify('segment_expired', '{"segment_id":"<uuid>","segment_set_ids":[...]}')

This module listens for those notifications and invalidates every affected
cached segment set so the next GET lazily rebuilds with current-valid rows.

Design:
- A dedicated asyncpg connection (NOT from the pool) handles LISTEN —
  pool connections are recycled and LISTEN state is per-connection.
- A sync callback pushes notifications onto an asyncio.Queue; an async
  task drains the queue and calls cache.invalidate_segset() for each
  affected set.
- On connection loss the listener reconnects with a backoff.  Missed
  notifications are tolerated — the Redis TTL on segment-set keys is a
  safety net that bounds staleness.
"""

import asyncio
import json
import uuid

import asyncpg

from .cache import invalidate_segset
from .config import get_settings

_notify_queue: asyncio.Queue[str] = asyncio.Queue(maxsize=256)


def _on_notify(connection: asyncpg.Connection, pid: int, channel: str, payload: str) -> None:
    """Sync callback fired by asyncpg — push onto the async queue."""
    try:
        _notify_queue.put_nowait(payload)
    except asyncio.QueueFull:
        # Queue saturated — missed invalidation tolerated via Redis TTL safety net.
        print("[listener] WARNING: notify queue full, dropped segment expiry event")


async def listen_segment_expirations() -> None:
    """Long-lived task: LISTEN segment_expired, invalidate affected caches.

    Runs until cancelled.  Reconnects automatically on connection loss.
    """
    settings = get_settings()
    reconnect_delay = 1.0

    while True:
        conn: asyncpg.Connection | None = None
        try:
            conn = await asyncpg.connect(
                dsn=settings.postgres_dsn,
                # Dedicated connection — not from the main pool.
            )
            await conn.add_listener("segment_expired", _on_notify)
            print("[listener] connected — LISTEN segment_expired on dedicated connection")

            # Drain the queue, processing notifications as they arrive.
            while True:
                try:
                    payload = await asyncio.wait_for(_notify_queue.get(), timeout=60)
                except asyncio.TimeoutError:
                    continue  # heartbeat — loop back, check cancellation

                try:
                    data = json.loads(payload)
                except json.JSONDecodeError:
                    print(f"[listener] malformed payload: {payload[:120]}")
                    continue

                set_ids = data.get("segment_set_ids") or []
                seg_id = data.get("segment_id", "?")
                invalidated = 0
                for ssid in set_ids:
                    try:
                        await invalidate_segset(uuid.UUID(ssid))
                        invalidated += 1
                    except Exception as exc:
                        print(f"[listener] failed to invalidate {ssid}: {exc}")

                if invalidated:
                    print(
                        f"[listener] segment {seg_id} expired → "
                        f"invalidated {invalidated}/{len(set_ids)} segset(s)"
                    )

        except asyncio.CancelledError:
            break
        except Exception as exc:
            print(f"[listener] connection error: {exc} — reconnecting in {reconnect_delay:.0f}s")
            await asyncio.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 1.5, 30.0)
        finally:
            reconnect_delay = 1.0
            if conn is not None:
                try:
                    await conn.remove_listener("segment_expired", _on_notify)
                except Exception:
                    pass
                try:
                    await conn.close()
                except Exception:
                    pass
