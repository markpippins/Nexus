import asyncio
import logging
import os
import argparse
import sys

# Add the current directory to sys.path so we can import fs_crawler_v2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fs_crawler_v2.cache import DedupeCache
from fs_crawler_v2.publisher import Publisher
from fs_crawler_v2.scanner import Scanner

async def main():
    parser = argparse.ArgumentParser(description="voyager: Filesystem Acquisition Layer")
    parser.add_argument("--path", default=".", help="Path to scan")
    parser.add_argument("--nats", default=os.getenv("NATS_URL"), help="NATS URL")
    parser.add_argument("--redis", default=os.getenv("REDIS_URL"), help="Redis URL")
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

    scanner = Scanner(cache=cache, publisher=publisher)
    
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

if __name__ == "__main__":
    asyncio.run(main())
