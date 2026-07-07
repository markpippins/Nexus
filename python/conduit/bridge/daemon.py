"""
Bridge Daemon — standalone entrypoint for the conduit → kernel sync loop.

Designed to run as:
    - A Docker container (via ``docker-compose``)
    - A systemd service
    - A background process (``python -m bridge.daemon``)

Handles SIGTERM, SIGINT, and SIGHUP for graceful shutdown.
Logs to stdout (12-factor style) at INFO level by default.

Environment variables:
    CONDUIT_PG_DSN    PostgreSQL connection string (required)
    POLL_INTERVAL     Seconds between poll cycles (default: 30)
    LOG_LEVEL         Logging level (default: INFO)

The wrp-kernel is an in-process Python library imported by the syncer;
there is no KERNEL_API_URL or HTTP endpoint on port 3103.
"""

import logging
import os
import signal
import sys
import time

from bridge.sync import syncer

_log = logging.getLogger("bridge.daemon")

# ── Sentinel for graceful shutdown ─────────────────────────────────────
_shutdown_requested = False


def _handle_signal(signum: int, _frame) -> None:
    """Set the shutdown flag on SIGTERM, SIGINT, SIGHUP."""
    global _shutdown_requested
    signame = signal.Signals(signum).name
    _log.info("daemon: received %s — shutting down gracefully", signame)
    _shutdown_requested = True


def _setup_signal_handlers() -> None:
    """Install signal handlers for graceful shutdown."""
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGHUP, _handle_signal)


# ── Daemon loop ────────────────────────────────────────────────────────

def run_daemon(interval: int = 30) -> None:
    """Run the bridge sync loop until shutdown is requested.

    Args:
        interval: Seconds between poll cycles.
    """
    _log.info("daemon: starting (interval=%ds, kernel=in-process)", interval)

    _setup_signal_handlers()

    try:
        while not _shutdown_requested:
            try:
                n = syncer.sync_once()
                if n > 0:
                    _log.info("daemon: synced %d receipt(s)", n)
                elif n == -1:
                    _log.warning("daemon: sync cycle failed (kernel rejected delta)")
            except Exception as exc:
                _log.error("daemon: sync cycle error: %s", exc, exc_info=True)

            # Sleep in short intervals so we respond promptly to signals
            for _ in range(interval):
                if _shutdown_requested:
                    break
                time.sleep(1)

    finally:
        syncer.close()
        _log.info("daemon: shutdown complete")


# ── CLI entrypoint ─────────────────────────────────────────────────────

def main() -> None:
    """Parse CLI args and run the daemon."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Conduit → Kernel bridge daemon. "
                    "Syncs receipts from vision.receipts to the WRP Kernel Runtime."
    )
    parser.add_argument(
        "--interval", type=int, default=int(os.environ.get("POLL_INTERVAL", "30")),
        help="Poll interval in seconds (default: 30, env: POLL_INTERVAL)",
    )

    parser.add_argument(
        "--log-level", default=os.environ.get("LOG_LEVEL", "INFO"),
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level (default: INFO, env: LOG_LEVEL)",
    )
    parser.add_argument(
        "--oneshot", action="store_true",
        help="Run one sync cycle and exit (for cron-style usage)",
    )
    args = parser.parse_args()

    # Configure logging (12-factor: stdout)
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
        stream=sys.stdout,
    )

    if args.oneshot:
        n = syncer.sync_once()
        if n > 0:
            print(f"bridge: synced {n} receipt(s)")
        elif n == 0:
            print("bridge: nothing new")
        else:
            print("bridge: sync failed (kernel rejected)")
            sys.exit(1)
        syncer.close()
        return

    run_daemon(interval=args.interval)


if __name__ == "__main__":
    main()
