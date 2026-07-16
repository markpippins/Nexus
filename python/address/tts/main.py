"""main.py — TTS subscriber + REST API server.

Non-invasive speech projection layer that connects to conduit event
streams and produces spoken audio output via NATS.

Dual-mode operation:
  1. NATS subscriber — subscribes to nexus.kernel.v1.transition.>
     and speaks work request state transitions as they happen.
  2. REST API — exposes endpoints for nexus-assembly to request
     synthesis of static content (transcripts, harvests, candidates,
     posts).

Usage::

    # Start the TTS server (NATS subscriber + REST API):
    DATABASE_URL=postgres://pguser:pgpass@localhost:5432/nexus \\
        NATS_URL=nats://localhost:4222 \\
        python3 main.py

    # REST API (on http://localhost:8600):
    curl -X POST http://localhost:8600/synthesize \\
        -H 'Content-Type: application/json' \\
        -d '{"text":"Plan 1258 completed successfully"}'

Architecture::

    conduit.work_request_events (PostgreSQL)
        ↓ AFTER INSERT trigger → pg_notify('kernel_transition_committed')
    kernel_subscriber.py (LISTEN → NATS)
        ↓ nexus.kernel.v1.transition.>
    TTS server (NATS subscriber)
        ↓
    projector.project_event()
        ↓
    utterance_queue.enqueue()
        ↓
    synthesizer.synthesize()  →  .wav file
        ↓
    audio.play()  →  system speaker

    REST API (port 8600):
    POST /synthesize  ← nexus-assembly requests playback
    GET  /audio/<name> ← serve synthesized files
    GET  /health       ← liveness check
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, parse_qs


# ── Path setup ──────────────────────────────────────────────────────
# main.py is at nexus/python/address/tts/main.py.
# We need nexus/python/ on sys.path so that 'from address.tts.xxx import ...' works.
_PROJECT_PYTHON = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _PROJECT_PYTHON not in sys.path:
    sys.path.insert(0, _PROJECT_PYTHON)

from address.tts.projector import (
    project_event,
    project_health_check,
    project_static_text,
    Utterance,
    UtteranceType,
)
from address.tts.utterance_queue import UtteranceQueue
from address.tts.synthesizer import synthesize, AUDIO_CACHE_DIR
from address.tts.audio import play


# ── Configuration ───────────────────────────────────────────────────
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgres://pguser:pgpass@localhost:5432/nexus",
)
NATS_URL = os.getenv("NATS_URL", "nats://localhost:4222")
NATS_SUBJECT = os.getenv(
    "TTS_NATS_SUBJECT",
    "nexus.kernel.v1.transition.>",
)
REST_PORT = int(os.getenv("TTS_PORT", "8600"))
HEALTH_CHECK_INTERVAL = float(os.getenv("TTS_HEALTH_INTERVAL", "300.0"))  # 5 min

# ── Global state ────────────────────────────────────────────────────
_queue = UtteranceQueue()
_running = True


# ── Logging ─────────────────────────────────────────────────────────
def _log(msg: str, *args: Any) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    print(f"[{ts}] [tts] {msg % args}", file=sys.stderr, flush=True)


# ═══════════════════════════════════════════════════════════════════════
#  NATS Subscriber
# ═══════════════════════════════════════════════════════════════════════

def _get_pg_conn():
    """Create a new PostgreSQL connection (used for health checks)."""
    import psycopg2
    return psycopg2.connect(DATABASE_URL)


def _get_pending_plan_count(pg_conn) -> int:
    """Count pending work requests from nebula.work_requests."""
    try:
        with pg_conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM nebula.work_requests WHERE status = 'pending'"
            )
            row = cur.fetchone()
            return row[0] if row else 0
    except Exception:
        return 0


def _get_active_builder_count(pg_conn) -> int:
    """Count distinct work requests claimed in the last hour (proxy for active builders)."""
    try:
        with pg_conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(DISTINCT work_request_id) FROM conduit.work_request_events "
                "WHERE event_type = 'WR_CLAIMED' "
                "AND occurred_at > NOW() - INTERVAL '1 hour'"
            )
            row = cur.fetchone()
            return row[0] if row else 0
    except Exception:
        return 0


def _get_blocked_plan_count(pg_conn) -> int:
    """Count failed work requests (proxy for blocked)."""
    try:
        with pg_conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM nebula.work_requests WHERE status = 'failed'"
            )
            row = cur.fetchone()
            return row[0] if row else 0
    except Exception:
        return 0


async def _periodic_health_check(pg_conn) -> None:
    """Async loop: enqueue a health check utterance every HEALTH_CHECK_INTERVAL."""
    while _running:
        await asyncio.sleep(HEALTH_CHECK_INTERVAL)
        if not _running:
            break
        try:
            pending = _get_pending_plan_count(pg_conn)
            active = _get_active_builder_count(pg_conn)
            blocked = _get_blocked_plan_count(pg_conn)
            health = project_health_check(
                pending_plans=pending,
                active_builders=active,
                blocked_plans=blocked,
            )
            _queue.enqueue(health)
            _log(
                "Health check enqueued: %s pending, %s active, %s blocked",
                pending,
                active,
                blocked,
            )
        except Exception as e:
            _log("Health check error: %s", e)


async def _nats_subscriber_loop() -> None:
    """Async loop: connect to NATS, subscribe, and enqueue utterances.

    Runs in its own asyncio event loop on a background thread.
    Follows the pattern of assembly_subscriber.py for direct NATS
    connectivity without cascade dependencies.
    """
    try:
        import psycopg2
    except ImportError:
        _log("FATAL: psycopg2 not installed. Install with: pip install psycopg2-binary")
        return

    try:
        import nats
    except ImportError:
        _log("FATAL: nats-py not installed. Install with: pip install nats-py")
        return

    # ── Connect to PostgreSQL (for health checks) ──
    pg_conn = None
    try:
        pg_conn = _get_pg_conn()
        pg_conn.autocommit = True
        _log("PostgreSQL connected for health checks")
    except Exception as e:
        _log("PostgreSQL unavailable (%s) — health checks will be skipped", e)

    # ── Connect to NATS ──
    nc = None
    sub = None
    try:
        _log("Connecting to NATS at %s...", NATS_URL)
        nc = await nats.connect(NATS_URL, name="tts-subscriber")
        _log("NATS connected")
    except Exception as e:
        _log("FATAL: Cannot connect to NATS at %s: %s", NATS_URL, e)
        if pg_conn:
            pg_conn.close()
        return

    event_count = 0

    # ── Message handler ──
    async def on_message(msg: Any) -> None:
        nonlocal event_count
        try:
            data: dict[str, Any] = json.loads(msg.data.decode())

            # The CanonicalEnvelope wraps kernel transition events.
            # Extract the inner payload to get at conduit event data.
            inner = data.get("payload", {}) or {}
            if isinstance(inner, dict):
                kernel_payload = inner.get("payload", {}) or {}
                if isinstance(kernel_payload, dict):
                    raw = kernel_payload.get("raw", kernel_payload)
                else:
                    raw = kernel_payload
            else:
                raw = inner

            event_type = raw.get("event_type", data.get("event_type", ""))

            if not event_type:
                return

            # Skip TTS events and no-ops
            if event_type.startswith("tts.") or event_type == "WR_NOOP":
                return

            # Project the event
            utterance = project_event(event_type, raw)
            if utterance is not None:
                _queue.enqueue(utterance)

            event_count += 1
            if event_count % 10 == 0:
                _log("Received %d events, queue=%d", event_count, _queue.size())

        except json.JSONDecodeError as e:
            _log("Invalid JSON from NATS: %s", e)
        except Exception as e:
            _log("Error processing NATS message: %s", e)

    # ── Subscribe ──
    sub = await nc.subscribe(NATS_SUBJECT, cb=on_message)
    _log("Subscribed to %s — waiting for conduit events...", NATS_SUBJECT)

    # ── Start periodic health check ──
    health_task = None
    if pg_conn:
        health_task = asyncio.create_task(_periodic_health_check(pg_conn))

    # ── Wait for shutdown ──
    # nats-py handles reconnection automatically (default: 60 attempts, 2s wait).
    # The subscription remains valid across reconnects.
    try:
        while _running:
            await asyncio.sleep(0.5)
    except asyncio.CancelledError:
        pass
    finally:
        _log("NATS subscriber shutting down — %d events received", event_count)
        if health_task:
            health_task.cancel()
            try:
                await health_task
            except asyncio.CancelledError:
                pass
        if sub is not None:
            await sub.unsubscribe()
        if nc is not None:
            await nc.drain()
            await nc.close()
        if pg_conn:
            pg_conn.close()
        _log("NATS subscriber stopped")


def _run_nats_loop() -> None:
    """Entry point for the NATS subscriber thread.

    Creates its own asyncio event loop and runs the subscriber
    until _running is set to False.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_nats_subscriber_loop())
    except Exception as e:
        _log("NATS loop fatal error: %s", e)
    finally:
        loop.close()


# ═══════════════════════════════════════════════════════════════════════
#  Work Request Summary (for /speak endpoint)
# ═══════════════════════════════════════════════════════════════════════

def _build_work_request_summary(wr_id: str) -> str:
    """Query the database and build a spoken summary of a work request.

    Includes current state, title, and recent event history.
    """
    import psycopg2

    pg_conn = _get_pg_conn()
    pg_conn.autocommit = True

    try:
        with pg_conn.cursor() as cur:
            # Get current state + title (state may not exist yet)
            cur.execute(
                """
                SELECT
                    COALESCE(wrs.current_state, ''),
                    COALESCE(wr.title, ''),
                    COALESCE(wr.status, '')
                FROM conduit.work_request_state wrs
                LEFT JOIN nebula.work_requests wr
                    ON wr.legacy_id = wrs.work_request_id::text
                WHERE wrs.work_request_id = %s::uuid
                """,
                (wr_id,),
            )
            state_row = cur.fetchone()

            # Get all events for this work request
            cur.execute(
                """
                SELECT event_type, payload->>'reason' as reason,
                       payload->'intent'->>'objective' as objective,
                       occurred_at
                FROM conduit.work_request_events
                WHERE work_request_id = %s::uuid
                ORDER BY sequence_number DESC
                LIMIT 5
                """,
                (wr_id,),
            )
            events = cur.fetchall()

            if not state_row and not events:
                raise ValueError(
                    f"Work request {wr_id[:8]} not found"
                )

            current_state = state_row[0] if state_row else ""
            title = state_row[1] if state_row else ""
            status = state_row[2] if state_row else ""

    finally:
        pg_conn.close()

    # Build spoken summary
    short_id = wr_id[:8]

    if title:
        parts = [f"Work request {short_id}: {title}."]
    else:
        parts = [f"Work request {short_id}."]

    if current_state:
        parts.append(f"Current state: {current_state}.")

    if events:
        event_descriptions = []
        for evt in events:
            event_type = evt[0]
            reason = evt[1] or ""
            objective = evt[2] or ""

            # Human-friendly event description
            label = event_type.replace("WR_", "").replace("_", " ").title()
            detail = reason or objective
            if detail:
                event_descriptions.append(f"{label}: {detail}")
            else:
                event_descriptions.append(label)

        parts.append(f"Last {len(event_descriptions)} events: " + ", ".join(event_descriptions) + ".")
    else:
        parts.append("No events recorded.")

    return " ".join(parts)


# ═══════════════════════════════════════════════════════════════════════
#  Speech Worker
# ═══════════════════════════════════════════════════════════════════════

def speech_worker_loop() -> None:
    """Background thread: dequeue utterances, synthesize, and play."""
    _log("Speech worker starting...")

    while _running:
        utterance = _queue.dequeue()

        if utterance is None:
            delay = _queue.peek_next_delay()
            if delay == float("inf"):
                time.sleep(0.5)
            else:
                time.sleep(min(delay, 0.5))
            continue

        try:
            _log("Speaking [p%d]: %s", utterance.priority, utterance.text[:80])

            # Synthesize
            result = synthesize(utterance.text)

            # Play
            play(result.audio_path)

            _log(
                "Spoken: %d chars → %s (%dms)",
                len(utterance.text),
                result.audio_path,
                result.duration_ms,
            )

        except Exception as e:
            _log("Speech error: %s", e)

    _log("Speech worker stopped")


# ═══════════════════════════════════════════════════════════════════════
#  REST API Server
# ═══════════════════════════════════════════════════════════════════════

class TTSRequestHandler(BaseHTTPRequestHandler):
    """Minimal HTTP handler for TTS REST API.

    Endpoints:
      POST /synthesize  — synthesize text to speech
      POST /speak        — speak the latest state of a work request
      GET  /audio/<name> — serve audio file
      GET  /health       — liveness check
    """

    def log_message(self, format: str, *args: Any) -> None:
        _log("REST %s %s", self.command, self.path)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/health":
            self._json_response(200, {
                "status": "ok",
                "queue_size": _queue.size(),
                "engine": "piper",
                "audio_cache": str(AUDIO_CACHE_DIR),
            })

        elif parsed.path.startswith("/audio/"):
            filename = parsed.path.split("/audio/", 1)[1]
            # Sanitize: prevent path traversal
            safe_name = os.path.basename(filename)
            filepath = AUDIO_CACHE_DIR / safe_name

            if filepath.exists() and filepath.is_file():
                self.send_response(200)
                self.send_header("Content-Type", "audio/wav")
                self.send_header("Content-Length", str(filepath.stat().st_size))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "public, max-age=86400")
                self.end_headers()
                with open(filepath, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self._json_response(404, {"error": "audio file not found"})

        else:
            self._json_response(404, {"error": "not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/speak":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length) if content_length else b"{}"

            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                self._json_response(400, {"error": "invalid JSON"})
                return

            wr_id = data.get("work_request_id", "").strip()
            if not wr_id:
                self._json_response(400, {"error": "work_request_id is required"})
                return

            try:
                spoken_text = _build_work_request_summary(wr_id)

                # Synthesize and play
                result = synthesize(spoken_text)
                should_play = data.get("play", True)
                if should_play:
                    play(result.audio_path)

                filename = os.path.basename(result.audio_path)

                self._json_response(200, {
                    "audio_path": result.audio_path,
                    "audio_url": f"/audio/{filename}",
                    "engine": result.engine,
                    "voice": result.voice,
                    "duration_ms": result.duration_ms,
                    "text": spoken_text[:200],
                    "played": should_play,
                    "work_request_id": wr_id,
                })

            except Exception as e:
                _log("Speak error for %s: %s", wr_id[:8], e)
                self._json_response(500, {"error": str(e)})

        elif parsed.path == "/synthesize":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length) if content_length else b"{}"

            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                self._json_response(400, {"error": "invalid JSON"})
                return

            text = data.get("text", "").strip()
            if not text:
                self._json_response(400, {"error": "text is required"})
                return

            try:
                # Synthesize immediately (don't queue — it's a direct request)
                result = synthesize(text)

                # Auto-play by default for immediate feedback
                should_play = data.get("play", True)
                if should_play:
                    play(result.audio_path)

                filename = os.path.basename(result.audio_path)

                self._json_response(200, {
                    "audio_path": result.audio_path,
                    "audio_url": f"/audio/{filename}",
                    "engine": result.engine,
                    "voice": result.voice,
                    "duration_ms": result.duration_ms,
                    "text": text[:200],
                    "played": should_play,
                })

            except Exception as e:
                _log("Synthesize error: %s", e)
                self._json_response(500, {"error": str(e)})

        else:
            self._json_response(404, {"error": "not found"})

    def _json_response(self, status: int, data: dict[str, Any]) -> None:
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


def _start_rest_server(port: int) -> None:
    """Start the HTTP REST API server (blocking)."""
    server = HTTPServer(("0.0.0.0", port), TTSRequestHandler)
    _log("REST API listening on http://localhost:%d", port)
    _log("  POST /synthesize  — synthesize text to speech")
    _log("  POST /speak       — speak work request state summary")
    _log("  GET  /audio/<name> — serve audio file")
    _log("  GET  /health       — liveness check")

    # Use a timeout so we can check _running periodically
    server.timeout = 0.5
    while _running:
        server.handle_request()

    server.server_close()
    _log("REST API stopped")


# ═══════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════

def _signal_handler(signum: int, _frame: Any) -> None:
    global _running
    _log("Signal %d received — shutting down...", signum)
    _running = False


def main() -> None:
    """Entry point: start NATS subscriber, speech worker, and REST API."""
    _log("=" * 60)
    _log("TTS Server — Speech Projection Layer for Conduit Monitoring")
    _log("=" * 60)
    _log("NATS: %s", NATS_URL)
    _log("Subject: %s", NATS_SUBJECT)
    _log("Database: %s", DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else DATABASE_URL)
    _log("REST port: %d", REST_PORT)
    _log("Health interval: %.0fs", HEALTH_CHECK_INTERVAL)
    _log("Audio cache: %s", AUDIO_CACHE_DIR)

    # Ensure audio cache directory exists
    AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # Install signal handlers
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    # Start background threads
    nats_thread = threading.Thread(
        target=_run_nats_loop,
        daemon=True,
        name="tts-nats",
    )
    speech_thread = threading.Thread(
        target=speech_worker_loop,
        daemon=True,
        name="tts-speech",
    )

    nats_thread.start()
    speech_thread.start()

    _log("Started: NATS subscriber + speech worker threads")

    # Start REST API (blocking, runs in main thread)
    try:
        _start_rest_server(REST_PORT)
    except KeyboardInterrupt:
        pass
    finally:
        _running = False
        nats_thread.join(timeout=5)
        speech_thread.join(timeout=5)
        _log("TTS Server stopped")


if __name__ == "__main__":
    main()
