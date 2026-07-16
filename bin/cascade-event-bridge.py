#!/usr/bin/env python3
"""Cascade event bus bridge — subscribes to conduit-mcp SSE and publishes to Redis.

This sidecar subscribes to the conduit-mcp SSE stream (port 3100) and
publishes each event to a Redis channel (`cascade-events`) so the
service-registry can broadcast them to its SSE clients.

Usage:
    cascade-event-bridge.py [--conduit-url http://localhost:3100] [--redis-host localhost]

Designed to run as a systemd sidecar alongside conduit-mcp.
"""

import argparse
import json
import logging
import signal
import sys
import time
import urllib.request
import urllib.error

log = logging.getLogger("cascade-event-bridge")

# Redis channel for cascade events
REDIS_CHANNEL = "cascade-events"


def publish_to_redis(channel: str, data: str, redis_host: str = "localhost", redis_port: int = 6379):
    """Publish a message to a Redis channel using the SIMPLE protocol."""
    try:
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((redis_host, redis_port))

        # Send PUBLISH command
        msg = f"PUBLISH {channel} {len(data)}\r\n{data}\r\n"
        sock.sendall(msg.encode())

        # Read response
        response = sock.recv(1024).decode().strip()
        sock.close()

        # Response should be :<number> (number of subscribers)
        if response.startswith(":"):
            return True
        else:
            log.warning("Unexpected Redis response: %s", response)
            return False
    except Exception as e:
        log.warning("Redis publish failed: %s", e)
        return False


def subscribe_sse(url: str, redis_host: str, redis_port: int):
    """Subscribe to SSE endpoint and publish events to Redis."""
    log.info("Subscribing to SSE: %s", url)

    req = urllib.request.Request(url, headers={"Accept": "text/event-stream"})
    event_type = None
    event_data = []

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            for line in resp:
                line = line.decode("utf-8", errors="replace").rstrip("\r\n")

                if line.startswith("event:"):
                    event_type = line[6:].strip()
                elif line.startswith("data:"):
                    data = line[5:].strip()
                    event_data.append(data)
                elif line == "":
                    # End of event — publish to Redis
                    if event_type and event_data:
                        payload = json.dumps({
                            "type": event_type,
                            "data": json.loads("\n".join(event_data)) if event_data else None,
                        })
                        publish_to_redis(REDIS_CHANNEL, payload, redis_host, redis_port)
                        log.debug("Published %s event to Redis", event_type)

                    event_type = None
                    event_data = []

    except (urllib.error.URLError, urllib.error.HTTPError, OSError) as e:
        log.warning("SSE connection lost: %s", e)
        return False

    return True


def main():
    parser = argparse.ArgumentParser(description="Cascade event bus bridge")
    parser.add_argument("--conduit-url", default="http://localhost:3100/events",
                        help="Conduit-mcp SSE endpoint")
    parser.add_argument("--redis-host", default="localhost", help="Redis host")
    parser.add_argument("--redis-port", type=int, default=6379, help="Redis port")
    parser.add_argument("--reconnect-delay", type=int, default=5,
                        help="Seconds to wait before reconnecting")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    )

    stop = False

    def handle_signal(sig, frame):
        nonlocal stop
        log.info("Received signal %s, shutting down...", sig)
        stop = True

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    log.info("Cascade event bridge started")

    while not stop:
        success = subscribe_sse(args.conduit_url, args.redis_host, args.redis_port)
        if stop:
            break
        if not success:
            log.info("Reconnecting in %ds...", args.reconnect_delay)
            time.sleep(args.reconnect_delay)

    log.info("Cascade event bridge stopped")


if __name__ == "__main__":
    main()
