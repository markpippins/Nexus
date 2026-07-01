"""test_pipeline_e2e.py — Full pipeline integration test.

Verifies the complete event flow:
  NATS → Cascade event bus → inference_subscriber → InferenceCompleted

Steps:
  1. Start a threaded NATS subscriber capturing all events
  2. Start inference_subscriber.py (subprocess)
  3. Start Cascade main.py (subprocess, polls events/ → publishes to NATS)
  4. Drop a test IdeaCaptured event into events/
  5. Wait for Cascade poll cycle → NATS publish → subscriber receive → inference
  6. Verify: IdeaCaptured on NATS, InferenceCompleted on NATS + events/ file

This test uses real NATS (localhost:4222) and real subprocesses.
Inference config resolution may fail (no Tackle config), but the pipeline
should still produce an InferenceCompleted event with an error status.

Usage:
    cd /home/codex/dev/nexus/python/cascade && NATS_URL=nats://localhost:4222 python3 test_pipeline_e2e.py
"""
import json
import os
import queue
import signal
import subprocess
import sys
import threading
import time
import uuid

CASCADE_DIR = os.path.dirname(os.path.abspath(__file__))
NATS_URL = os.getenv("NATS_URL", "nats://localhost:4222")
EVENTS_DIR = os.path.join(CASCADE_DIR, "events")

# ── Subjects to monitor ──
WILDCARD_SUBJECT = "nexus.cascade.v1.>"
IDEA_CAPTURED_SUBJECT = "nexus.cascade.v1.workflow.idea_captured"


class NatsMonitor:
    """Threaded NATS subscriber — captures all messages on a wildcard subject."""

    def __init__(self, nats_url: str, subject: str):
        self.nats_url = nats_url
        self.subject = subject
        self.messages: queue.Queue = queue.Queue()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._ready = threading.Event()

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True, name="nats-monitor")
        self._thread.start()

    def stop(self, wait: float = 3.0) -> list[dict]:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=wait)
        result = []
        while True:
            try:
                result.append(self.messages.get_nowait())
            except queue.Empty:
                break
        return result

    def wait_ready(self, timeout: float = 5.0) -> bool:
        return self._ready.wait(timeout=timeout)

    def _run(self) -> None:
        import asyncio

        async def _subscribe():
            import nats

            nc = await nats.connect(self.nats_url)

            async def handler(msg):
                try:
                    data = json.loads(msg.data.decode())
                except json.JSONDecodeError:
                    data = {"raw": msg.data.decode()[:500]}
                self.messages.put({"subject": msg.subject, "data": data})

            await nc.subscribe(self.subject, cb=handler)
            self._ready.set()

            while not self._stop.is_set():
                await asyncio.sleep(0.2)

            await nc.close()

        asyncio.run(_subscribe())


def _start_cascade() -> subprocess.Popen:
    """Start Cascade main.py as a subprocess."""
    env = os.environ.copy()
    env["NATS_URL"] = NATS_URL
    return subprocess.Popen(
        [sys.executable, "-u", "main.py"],
        cwd=CASCADE_DIR,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def _start_subscriber() -> subprocess.Popen:
    """Start inference_subscriber.py as a subprocess."""
    env = os.environ.copy()
    env["NATS_URL"] = NATS_URL
    return subprocess.Popen(
        [sys.executable, "-u", "inference_subscriber.py"],
        cwd=CASCADE_DIR,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def _stop_process(proc: subprocess.Popen, label: str) -> tuple[str, str]:
    """Gracefully stop a subprocess and return its output."""
    try:
        proc.send_signal(signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        stdout, stderr = proc.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        stdout, stderr = proc.communicate()
    return stdout or "", stderr or ""


def main():
    test_event_id = str(uuid.uuid4())
    test_event = {
        "id": test_event_id,
        "type": "IdeaCaptured",
        "timestamp": "2026-06-28T14:00:00Z",
        "source": "pipeline-e2e",
        "payload": {
            "idea": "Integration test: verify full Cascade pipeline end-to-end"
        },
    }

    print(f"[e2e] NATS_URL={NATS_URL}")
    print(f"[e2e] Test event: {test_event_id[:12]}...")

    all_pass = True

    # ── Step 1: Start NATS monitor (captures ALL messages) ──
    print("[e2e] Starting NATS monitor...")
    monitor = NatsMonitor(NATS_URL, WILDCARD_SUBJECT)
    monitor.start()
    if not monitor.wait_ready(timeout=5.0):
        print("[e2e] ❌ NATS monitor failed to connect")
        return 1
    print("[e2e]   → Monitor subscribed")

    # ── Step 2: Start inference_subscriber ──
    print("[e2e] Starting inference_subscriber...")
    subscriber_proc = _start_subscriber()
    time.sleep(2.5)  # Give it time to connect + subscribe

    # ── Step 3: Start Cascade main.py ──
    print("[e2e] Starting Cascade main.py...")
    cascade_proc = _start_cascade()
    time.sleep(4.0)  # Give Cascade time to connect NATS sidecar

    # ── Step 4: Drop test event ──
    event_path = os.path.join(EVENTS_DIR, f"test_pipeline_e2e_{test_event_id[:8]}.json")
    os.makedirs(EVENTS_DIR, exist_ok=True)
    print(f"[e2e] Dropping test event: {test_event_id}")
    with open(event_path, "w") as f:
        json.dump(test_event, f)

    # ── Step 5: Wait for full pipeline with polling ──
    # Cascade polls every 2s + NATS publish + subscriber receives + inference
    print("[e2e] Waiting for full pipeline (Cascade poll → NATS → subscriber → inference)...")
    deadline = time.time() + 30
    inference_file_found = None
    while time.time() < deadline:
        # Check events/ for InferenceCompleted files that reference our test event
        if os.path.isdir(EVENTS_DIR):
            for fn in os.listdir(EVENTS_DIR):
                fpath = os.path.join(EVENTS_DIR, fn)
                if fn.endswith(".json") and "test_pipeline_e2e" not in fn:
                    try:
                        mtime = os.path.getmtime(fpath)
                        if time.time() - mtime > 30:  # skip files older than 30s
                            continue
                        with open(fpath) as f:
                            data = json.load(f)
                        if (data.get("type") == "InferenceCompleted"
                                and data.get("payload", {}).get("source_event_id") == test_event_id):
                            inference_file_found = data
                            break
                    except (json.JSONDecodeError, OSError):
                        pass
            if inference_file_found:
                break
        time.sleep(1)

    if inference_file_found:
        print(f"[e2e]   → InferenceCompleted found at {time.time() - deadline + 30:.1f}s")

    # ── Step 6: Stop components and collect results ──
    print("[e2e] Stopping Cascade...")
    cascade_stdout, cascade_stderr = _stop_process(cascade_proc, "Cascade")

    print("[e2e] Stopping inference_subscriber...")
    sub_stdout, sub_stderr = _stop_process(subscriber_proc, "Subscriber")

    print("[e2e] Stopping NATS monitor...")
    messages = monitor.stop(wait=3.0)

    # ── Step 7: Collect InferenceCompleted files ──
    inference_files = [inference_file_found] if inference_file_found else []

    # ═══════════════════════════════════════════════════════════════
    #  Results
    # ═══════════════════════════════════════════════════════════════
    print("\n" + "=" * 60)
    print("RESULTS")
    print("=" * 60)

    # VERIFY 1: Cascade published the event to NATS
    idea_msgs = [m for m in messages if m["subject"] == IDEA_CAPTURED_SUBJECT]
    cascade_published = any(
        test_event_id in json.dumps(m.get("data", {})) for m in idea_msgs
    )
    print(f"\n1. IdeaCaptured on NATS subject:    {'✅' if cascade_published else '❌'}")
    if not cascade_published:
        print(f"   → Test event {test_event_id[:12]} not found on {IDEA_CAPTURED_SUBJECT}")
        print(f"   → IdeaCaptured messages seen: {len(idea_msgs)}")
        all_pass = False

    # VERIFY 2: Cascade reported publishing
    cascade_output = cascade_stdout + cascade_stderr
    cascade_reported = "Published" in cascade_output
    print(f"2. Cascade reported 'Published':     {'✅' if cascade_reported else '❌'}")
    if not cascade_reported:
        print(f"   → Cascade output (last 500 chars):")
        print(f"   {cascade_output[-500:]}")
        all_pass = False

    # VERIFY 3: inference_subscriber received and processed
    sub_output = sub_stdout + sub_stderr
    subscriber_processed = any(
        kw in sub_output for kw in ["Processing event", "Resolved config",
                                     "No Tackle config", "Inference completed",
                                     "Event written", "Event enqueued"]
    )
    print(f"3. Subscriber processed event:       {'✅' if subscriber_processed else '❌'}")
    if not subscriber_processed:
        print(f"   → Subscriber output (last 800 chars):")
        print(f"   {sub_output[-800:]}")
        all_pass = False

    # VERIFY 4: InferenceCompleted appeared on NATS
    inference_msgs = [m for m in messages
                      if "inference" in m.get("subject", "").lower()]
    inference_on_nats = len(inference_msgs) > 0
    print(f"4. InferenceCompleted on NATS:        {'✅' if inference_on_nats else '❌'}"
          f" ({len(inference_msgs)} message(s))")
    if not inference_on_nats:
        all_pass = False

    # VERIFY 5: InferenceCompleted file written to events/
    inference_on_disk = len(inference_files) > 0
    print(f"5. InferenceCompleted on disk:        {'✅' if inference_on_disk else '❌'}"
          f" ({len(inference_files)} file(s))")
    for inf in inference_files[:3]:
        status = inf.get("payload", {}).get("status", "?")
        print(f"   → {inf.get('id','?')[:12]}...  status={status}")
    if not inference_on_disk:
        all_pass = False

    # VERIFY 6: Subscriber received the IdeaCaptured from NATS
    subscriber_got_event = "Processing event" in sub_output
    print(f"6. Subscriber received IdeaCaptured:  {'✅' if subscriber_got_event else '❌'}")

    # ── Detailed output for debugging ──
    print(f"\n─── Cascade summary ───")
    for line in cascade_output.splitlines():
        if any(k in line for k in ["Published", "NATS", "sidecar", "JetStream", "connected"]):
            print(f"  {line.strip()[:120]}")

    print(f"\n─── Subscriber summary ───")
    for line in sub_output.splitlines():
        if any(k in line for k in ["Processing", "Resolved", "No Tackle", "Event written",
                                     "Event enqueued", "Ready", "connect", "subscribe",
                                     "Inference", "error", "written"]):
            print(f"  {line.strip()[:120]}")

    print(f"\n─── NATS messages captured ───")
    print(f"  Total: {len(messages)}")
    for i, m in enumerate(messages):
        d = m.get("data", {})
        eid = d.get("id", "?")[:20] if isinstance(d, dict) else str(d)[:20]
        etype = d.get("type", d.get("event_type", "?")) if isinstance(d, dict) else "?"
        print(f"  [{i}] {m['subject']:50s}  type={etype:20s}  id={eid}")

    # ── Cleanup ──
    if os.path.exists(event_path):
        os.remove(event_path)
    offset_path = os.path.join(CASCADE_DIR, "offset.json")
    if os.path.exists(offset_path):
        os.remove(offset_path)
    # Clean up InferenceCompleted files created by this test
    if inference_file_found:
        inf_path = os.path.join(EVENTS_DIR, f"{inference_file_found['id']}.json")
        if os.path.exists(inf_path):
            os.remove(inf_path)

    # ── Final ──
    print()
    if all_pass:
        print("🎉 FULL PIPELINE TEST PASSED")
        print("   NATS → Cascade → inference_subscriber → InferenceCompleted")
    else:
        print("💥 PIPELINE TEST FAILED — see details above")

    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
