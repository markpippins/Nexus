"""Lightweight heartbeat client for service-registry.

Sends periodic heartbeats to the service-registry (port 8085) via Redis.
The registry marks services as OFFLINE if no heartbeat arrives within 90s.

Usage:
    from heartbeat import start_heartbeat, stop_heartbeat

    start_heartbeat(service_id=20, service_name="conduit-mcp")
    # ... service runs ...
    stop_heartbeat()

Or as a context manager:
    with Heartbeat(service_id=20, service_name="conduit-mcp"):
        pass  # service runs

CLI test:
    python -m heartbeat --service-id 20 --service-name conduit-mcp
"""

import atexit
import logging
import os
import signal
import threading
import time
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

log = logging.getLogger("nexus-heartbeat")

# Defaults
DEFAULT_REGISTRY_URL = "http://localhost:8085"
DEFAULT_INTERVAL = 20  # seconds (must be < 60s TTL, well under 90s stale)
DEFAULT_TIMEOUT = 5    # HTTP timeout

# Global state for singleton pattern
_active_heartbeat: Optional["Heartbeat"] = None
_lock = threading.Lock()


class Heartbeat:
    """Sends periodic heartbeats to the service-registry.

    Args:
        service_id:   The numeric ID from registry.services (NOT NULL FK).
        service_name: The service name as registered in registry.services.
        registry_url: Base URL of the service-registry (default: http://localhost:8085).
        interval:     Seconds between heartbeats (default: 20).
        timeout:      HTTP request timeout in seconds (default: 5).
    """

    def __init__(
        self,
        service_id: int,
        service_name: str,
        registry_url: str = DEFAULT_REGISTRY_URL,
        interval: int = DEFAULT_INTERVAL,
        timeout: int = DEFAULT_TIMEOUT,
    ):
        self.service_id = service_id
        self.service_name = service_name
        self.registry_url = registry_url.rstrip("/")
        self.interval = interval
        self.timeout = timeout
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._consecutive_failures = 0
        self._total_heartbeats = 0
        self._total_failures = 0

    @property
    def url(self) -> str:
        return f"{self.registry_url}/api/v1/registry/heartbeat/{self.service_name}"

    def _send_once(self) -> bool:
        """Send a single heartbeat. Returns True on success."""
        req = Request(
            self.url,
            data=b"",
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(req, timeout=self.timeout) as resp:
                if 200 <= resp.status < 300:
                    self._consecutive_failures = 0
                    self._total_heartbeats += 1
                    log.debug(
                        "Heartbeat OK: %s (total: %d)",
                        self.service_name,
                        self._total_heartbeats,
                    )
                    return True
                else:
                    self._consecutive_failures += 1
                    self._total_failures += 1
                    log.warning(
                        "Heartbeat %d for %s: %s",
                        resp.status,
                        self.service_name,
                        resp.read().decode("utf-8", errors="replace"),
                    )
                    return False
        except (URLError, HTTPError, OSError, TimeoutError) as e:
            self._consecutive_failures += 1
            self._total_failures += 1
            if self._consecutive_failures <= 3 or self._consecutive_failures % 10 == 0:
                log.warning(
                    "Heartbeat failed for %s (%d consecutive): %s",
                    self.service_name,
                    self._consecutive_failures,
                    e,
                )
            return False

    def _loop(self):
        """Background loop that sends heartbeats."""
        log.info(
            "Heartbeat started: %s (id=%d, interval=%ds, url=%s)",
            self.service_name,
            self.service_id,
            self.interval,
            self.url,
        )
        # Send first heartbeat immediately
        self._send_once()

        while not self._stop_event.is_set():
            self._stop_event.wait(self.interval)
            if not self._stop_event.is_set():
                self._send_once()

        log.info(
            "Heartbeat stopped: %s (sent=%d, failed=%d)",
            self.service_name,
            self._total_heartbeats,
            self._total_failures,
        )

    def start(self):
        """Start the heartbeat in a daemon thread."""
        if self._thread and self._thread.is_alive():
            log.warning("Heartbeat already running for %s", self.service_name)
            return
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._loop, name=f"heartbeat-{self.service_name}", daemon=True
        )
        self._thread.start()

    def stop(self):
        """Stop the heartbeat thread."""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None

    @property
    def stats(self) -> dict:
        return {
            "service_name": self.service_name,
            "service_id": self.service_id,
            "total_heartbeats": self._total_heartbeats,
            "total_failures": self._total_failures,
            "consecutive_failures": self._consecutive_failures,
            "running": self._thread is not None and self._thread.is_alive(),
        }

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *exc):
        self.stop()


def start_heartbeat(
    service_id: int,
    service_name: str,
    registry_url: str = DEFAULT_REGISTRY_URL,
    interval: int = DEFAULT_INTERVAL,
    timeout: int = DEFAULT_TIMEOUT,
) -> Heartbeat:
    """Start a global singleton heartbeat. Returns the Heartbeat instance."""
    global _active_heartbeat
    with _lock:
        if _active_heartbeat and _active_heartbeat._thread and _active_heartbeat._thread.is_alive():
            log.warning(
                "Replacing existing heartbeat for %s", _active_heartbeat.service_name
            )
            _active_heartbeat.stop()

        hb = Heartbeat(
            service_id=service_id,
            service_name=service_name,
            registry_url=registry_url,
            interval=interval,
            timeout=timeout,
        )
        hb.start()
        _active_heartbeat = hb

        # Register cleanup on exit
        atexit.register(stop_heartbeat)

        # Also handle SIGTERM/SIGINT for clean shutdown
        def _signal_handler(sig, frame):
            stop_heartbeat()

        signal.signal(signal.SIGTERM, _signal_handler)
        signal.signal(signal.SIGINT, _signal_handler)

        return hb


def stop_heartbeat():
    """Stop the global singleton heartbeat."""
    global _active_heartbeat
    with _lock:
        if _active_heartbeat:
            _active_heartbeat.stop()
            _active_heartbeat = None


def get_heartbeat() -> Optional[Heartbeat]:
    """Get the current active heartbeat instance (or None)."""
    return _active_heartbeat


# CLI entry point for testing
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Send heartbeats to service-registry")
    parser.add_argument("--service-id", type=int, required=True, help="Registry service ID")
    parser.add_argument("--service-name", required=True, help="Service name")
    parser.add_argument(
        "--registry-url", default=DEFAULT_REGISTRY_URL, help="Registry base URL"
    )
    parser.add_argument(
        "--interval", type=int, default=DEFAULT_INTERVAL, help="Heartbeat interval (s)"
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    )

    with Heartbeat(
        service_id=args.service_id,
        service_name=args.service_name,
        registry_url=args.registry_url,
        interval=args.interval,
    ):
        print(
            f"Heartbeat running for {args.service_name} (Ctrl+C to stop)..."
        )
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nStopping...")
