#!/usr/bin/env python3
"""cascade-pg-bridge.py — Bridges PostgreSQL cascade.events to Redis.

Polls the cascade.events table for new events and publishes them to the
Redis `cascade-events` channel so the service-registry can broadcast
them to SSE clients.

This complements cascade-event-bridge.py (which bridges conduit-mcp SSE).
Together they provide a complete event pipeline:

  conduit-mcp SSE → cascade-event-bridge.py → Redis
  cascade.events (PG) → cascade-pg-bridge.py → Redis

Usage:
    python3 cascade-pg-bridge.py [--interval 5] [--redis-host localhost]
"""

import argparse
import json
import logging
import signal
import socket
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import psycopg2

log = logging.getLogger("cascade-pg-bridge")

REDIS_CHANNEL = "cascade-events"

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "nexus",
    "user": "pguser",
    "password": "pgpass",
}


def publish_to_redis(channel: str, data: str, redis_host: str = "localhost", redis_port: int = 6379):
    """Publish a message to a Redis channel."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((redis_host, redis_port))
        msg = f"PUBLISH {channel} {len(data)}\r\n{data}\r\n"
        sock.sendall(msg.encode())
        response = sock.recv(1024).decode().strip()
        sock.close()
        return response.startswith(":")
    except Exception as e:
        log.warning("Redis publish failed: %s", e)
        return False


def get_last_sequence(conn) -> int:
    """Get the last processed sequence number."""
    with conn.cursor() as cur:
        cur.execute("SELECT COALESCE(MAX(sequence_number), 0) FROM cascade.events")
        return cur.fetchone()[0]


def poll_events(conn, last_seq: int) -> list[dict]:
    """Fetch new events since the last sequence number."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT event_id, event_type, source, event_timestamp,
                   payload, aggregate_type, aggregate_id,
                   actor_type, actor_id, sequence_number
            FROM cascade.events
            WHERE sequence_number > %s
            ORDER BY sequence_number ASC
            LIMIT 100
            """,
            (last_seq,),
        )
        events = []
        for row in cur.fetchall():
            events.append({
                "event_id": str(row[0]),
                "event_type": row[1],
                "source": row[2],
                "event_timestamp": row[3].isoformat() if row[3] else None,
                "payload": row[4] if row[4] else {},
                "aggregate_type": row[5],
                "aggregate_id": row[6],
                "actor_type": row[7],
                "actor_id": row[8],
                "sequence_number": row[9],
            })
        return events


def main():
    parser = argparse.ArgumentParser(description="Cascade PG-to-Redis bridge")
    parser.add_argument("--interval", type=int, default=5, help="Poll interval in seconds")
    parser.add_argument("--redis-host", default="localhost", help="Redis host")
    parser.add_argument("--redis-port", type=int, default=6379, help="Redis port")
    args = parser.parse_args()

    LOG_DIR = Path("/home/codex/dev/nexus/logs")
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stderr),
            logging.FileHandler(LOG_DIR / "cascade-pg-bridge.log"),
        ],
    )

    stop = False

    def handle_signal(sig, frame):
        nonlocal stop
        log.info("Received signal %s, shutting down...", sig)
        stop = True

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    log.info("Cascade PG bridge started (interval=%ds)", args.interval)

    conn = psycopg2.connect(**DB_CONFIG)
    last_seq = get_last_sequence(conn)
    log.info("Starting from sequence_number: %d", last_seq)

    while not stop:
        try:
            events = poll_events(conn, last_seq)
            
            for evt in events:
                # Publish to Redis in the format service-registry expects
                payload = json.dumps({
                    "type": evt["event_type"],
                    "data": {
                        "event_id": evt["event_id"],
                        "event_type": evt["event_type"],
                        "source": evt["source"],
                        "timestamp": evt["event_timestamp"],
                        "payload": evt["payload"],
                        "aggregate_type": evt["aggregate_type"],
                        "aggregate_id": evt["aggregate_id"],
                        "actor_type": evt["actor_type"],
                    },
                })
                
                if publish_to_redis(REDIS_CHANNEL, payload, args.redis_host, args.redis_port):
                    log.debug("Published %s (seq=%d)", evt["event_type"], evt["sequence_number"])
                else:
                    log.warning("Failed to publish %s", evt["event_type"])
            
            if events:
                last_seq = events[-1]["sequence_number"]
                log.info("Processed %d events (up to seq=%d)", len(events), last_seq)
            
            conn.commit()
            
        except Exception as e:
            log.error("Poll error: %s", e)
            conn.rollback()
            # Reconnect on error
            try:
                conn.close()
            except:
                pass
            conn = psycopg2.connect(**DB_CONFIG)
        
        time.sleep(args.interval)

    conn.close()
    log.info("Cascade PG bridge stopped")


if __name__ == "__main__":
    main()
