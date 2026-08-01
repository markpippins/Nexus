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
    parser.add_argument("--interval", type=int, default=10, help="Interval for continuous scan (seconds)")
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
            await scanner.scan_continuous(args.path, interval=args.interval)
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
