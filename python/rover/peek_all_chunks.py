#!/usr/bin/env python3
"""Dump all remaining LOSM chunks to temp files for analysis."""
import asyncio
import json
import sys
from pathlib import Path
from mcp import ClientSession
from mcp.client.sse import sse_client

JOB_ID = "f75d35a2"
SERVER_URL = "http://localhost:3102/sse"
OUT_DIR = Path("/tmp/losm-chunks")
OUT_DIR.mkdir(parents=True, exist_ok=True)

async def run():
    async with sse_client(url=SERVER_URL) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()

            # Get total count
            result = await session.call_tool("rover_job_status", {"job_id": JOB_ID})
            status = json.loads(result.content[0].text)
            total = status["total_chunks"]
            print(f"Total chunks: {total}, completed: {status['completed_chunks']}")

            # Peek at each pending chunk without submitting
            # We'll get them in order — the first pending one each time
            seen = set()
            for _ in range(total):
                result = await session.call_tool("rover_get_pending_chunk", {"job_id": JOB_ID})
                data = json.loads(result.content[0].text)
                if data.get("done"):
                    break
                idx = data["chunk_index"]
                if idx in seen:
                    # We've wrapped around — all remaining are the same first pending
                    print(f"Wrapped at chunk {idx}, all remaining chunks are pending.")
                    break
                seen.add(idx)
                text = data["chunk_text"]
                out_path = OUT_DIR / f"chunk-{idx:02d}.txt"
                out_path.write_text(text)
                print(f"Chunk {idx}: {len(text):>6} chars -> {out_path.name}")

            print(f"\nDumped {len(seen)} chunks to {OUT_DIR}/")
            print("Remaining pending from server:", data.get("pending_count", "?"))

asyncio.run(run())
