import asyncio
import logging
import os
import argparse
import sys

# Add the current directory to sys.path so we can import fs_crawler_v2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fs_crawler_v2.cache import DedupeCache
from fs_crawler_v2.publisher import Publisher
from fs_crawler_v2.persistence import PersistenceLayer
from fs_crawler_v2.scanner import Scanner


def _env_int(name: str, default: int) -> int:
    """Read an int env var safely, falling back to default on unset/garbage."""
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        logging.warning(f"Invalid {name}={raw!r} — using default {default}")
        return default


def _env_float(name: str, default: float) -> float:
    """Read a float env var safely, falling back to default on unset/garbage."""
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        logging.warning(f"Invalid {name}={raw!r} — using default {default}")
        return default

async def main():
    parser = argparse.ArgumentParser(description="voyager: Filesystem Acquisition Layer")
    parser.add_argument("--path", default=".", help="Path to scan")
    parser.add_argument("--nats", default=os.getenv("NATS_URL"), help="NATS URL")
    parser.add_argument("--redis", default=os.getenv("REDIS_URL"), help="Redis URL")
    parser.add_argument("--pg-dsn", default=os.getenv("PG_DSN"),
                        help="PostgreSQL DSN for persistence (e.g. postgresql://pguser:pgpass@localhost:5432/nexus)")
    parser.add_argument("--ignore-dirs", default=os.getenv("VOYAGER_IGNORE_DIRS"),
                        help="Comma-separated directory names to skip (env: VOYAGER_IGNORE_DIRS)")
    parser.add_argument("--ignore-extensions", default=os.getenv("VOYAGER_IGNORE_EXTENSIONS"),
                        help="Comma-separated file extensions to skip (env: VOYAGER_IGNORE_EXTENSIONS)")
    parser.add_argument("--continuous", action="store_true", help="Run in continuous watch mode")
    parser.add_argument("--interval", type=int, default=_env_int("VOYAGER_INTERVAL", 10),
                        help="Interval for continuous scan (seconds, env: VOYAGER_INTERVAL)")
    parser.add_argument("--cooldown-threshold", type=int, default=_env_int("VOYAGER_COOLDOWN_THRESHOLD", 50),
                        help="After >N new files in an epoch, back off (env: VOYAGER_COOLDOWN_THRESHOLD)")
    parser.add_argument("--cooldown-factor", type=float, default=_env_float("VOYAGER_COOLDOWN_FACTOR", 2.0),
                        help="Cooldown multiplier applied to new-file count (env: VOYAGER_COOLDOWN_FACTOR)")
    parser.add_argument("--cooldown-max", type=int, default=_env_int("VOYAGER_COOLDOWN_MAX", 600),
                        help="Cooldown cap in seconds (env: VOYAGER_COOLDOWN_MAX)")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    cache = DedupeCache(redis_url=args.redis)
    publisher = Publisher(nats_url=args.nats)
    await publisher.connect()

    # PostgreSQL persistence (optional — will fall back to logger mode if unavailable)
    persistence = None
    if args.pg_dsn:
        persistence = PersistenceLayer(dsn=args.pg_dsn)
        await persistence.connect()
        if persistence.pool:
            logging.info("PostgreSQL persistence enabled — writing observations to nexus.voyager")
        else:
            persistence = None
            logging.warning("PostgreSQL persistence unavailable — observations will only be published")

    scanner = Scanner(
        cache=cache, publisher=publisher, persistence=persistence,
        ignore_dirs=set(s.strip() for s in args.ignore_dirs.split(",") if s.strip()) if args.ignore_dirs is not None else None,
        ignore_extensions=set(s.strip() for s in args.ignore_extensions.split(",") if s.strip()) if args.ignore_extensions is not None else None,
    )
    
    try:
        if args.continuous:
            await scanner.scan_continuous(
                args.path,
                interval=args.interval,
                cooldown_threshold=args.cooldown_threshold,
                cooldown_factor=args.cooldown_factor,
                cooldown_max=args.cooldown_max,
            )
        else:
            await scanner.scan(args.path)
    except KeyboardInterrupt:
        logging.info("Scan interrupted by user")
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
    finally:
        await publisher.close()
        if persistence:
            await persistence.close()

if __name__ == "__main__":
    asyncio.run(main())
