#!/usr/bin/env python3
"""Heartbeat sidecar for systemd services.

Runs alongside a service and sends periodic heartbeats to service-registry.
On SIGTERM/SIGINT, sends a graceful shutdown heartbeat before exiting.

Usage:
    heartbeat-sidecar.py --service-name conduit-mcp --service-id 19 [--interval 20]

Designed to be started via systemd ExecStartPost or a wrapper script.
"""

import argparse
import json
import logging
import signal
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

log = logging.getLogger("heartbeat-sidecar")

REGISTRY_URL = "http://localhost:8085"


def send_heartbeat(service_name: str, timeout: int = 5) -> bool:
    """Send a single heartbeat. Returns True on success."""
    url = f"{REGISTRY_URL}/api/v1/registry/heartbeat/{service_name}"
    req = urllib.request.Request(
        url, data=b"", headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 300
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, TimeoutError) as e:
        log.warning("Heartbeat failed for %s: %s", service_name, e)
        return False


def send_graceful_shutdown(service_name: str, timeout: int = 5) -> bool:
    """Send a graceful shutdown heartbeat. Returns True on success."""
    url = f"{REGISTRY_URL}/api/v1/registry/deregister/{service_name}/graceful"
    req = urllib.request.Request(
        url, data=b"", headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 300
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, TimeoutError) as e:
        log.warning("Graceful shutdown failed for %s: %s", service_name, e)
        return False


def main():
    parser = argparse.ArgumentParser(description="Heartbeat sidecar for systemd services")
    parser.add_argument("--service-name", required=True, help="Service name in registry")
    parser.add_argument("--service-id", type=int, required=True, help="Service ID in registry")
    parser.add_argument("--interval", type=int, default=20, help="Heartbeat interval in seconds")
    parser.add_argument("--timeout", type=int, default=5, help="HTTP timeout in seconds")
    args = parser.parse_args()

    LOG_DIR = Path("/home/codex/dev/nexus/logs")
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stderr),
            logging.FileHandler(LOG_DIR / "heartbeat-sidecar.log"),
        ],
    )

    stop = False

    def handle_signal(sig, frame):
        nonlocal stop
        log.info("Received signal %s, shutting down...", sig)
        stop = True

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    log.info(
        "Heartbeat sidecar started: %s (id=%d, interval=%ds)",
        args.service_name, args.service_id, args.interval,
    )

    # Send first heartbeat immediately
    send_heartbeat(args.service_name, args.timeout)

    while not stop:
        time.sleep(args.interval)
        if not stop:
            send_heartbeat(args.service_name, args.timeout)

    # Send graceful shutdown
    log.info("Sending graceful shutdown for %s", args.service_name)
    send_graceful_shutdown(args.service_name, args.timeout)

    log.info("Heartbeat sidecar stopped: %s", args.service_name)


if __name__ == "__main__":
    main()
