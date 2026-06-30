#!/usr/bin/env python3
"""
WRP Kernel Ingest CLI — post a KernelDelta JSON payload to the kernel API.

Usage:
    python cli/ingest.py examples/sample-delta.json
    python cli/ingest.py --dry-run examples/sample-delta.json
"""

import json
import sys
import argparse
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError


DEFAULT_KERNEL_URL = "http://localhost:3103"


def main():
    parser = argparse.ArgumentParser(description="Ingest a KernelDelta to the kernel API")
    parser.add_argument("file", type=str, help="Path to JSON delta file")
    parser.add_argument("--url", default=DEFAULT_KERNEL_URL,
                        help=f"Kernel API base URL (default: {DEFAULT_KERNEL_URL})")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be sent without sending")
    args = parser.parse_args()

    # Read and validate payload
    path = Path(args.file)
    if not path.exists():
        print(f"Error: file not found: {path}")
        sys.exit(1)

    payload = json.loads(path.read_text())
    required = ["delta_id", "batch_id"]
    missing = [k for k in required if k not in payload]
    if missing:
        print(f"Error: missing required fields: {missing}")
        sys.exit(1)

    if args.dry_run:
        print(f"Kernel API URL: {args.url}/delta/")
        print("Payload:")
        print(json.dumps(payload, indent=2))
        sys.exit(0)

    # POST to kernel API
    url = f"{args.url}/delta/"
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")

    try:
        with urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            result = json.loads(body)
            print(json.dumps(result, indent=2))
            if result.get("success"):
                sys.exit(0)
            else:
                print(f"Error: {result.get('error', 'unknown')}")
                sys.exit(1)
    except URLError as e:
        print(f"Error connecting to kernel API at {url}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
