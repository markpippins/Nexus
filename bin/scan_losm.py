#!/usr/bin/env python3
"""Scan LOSM chunks, show meaningful content for analysis."""
import asyncio
import json
from mcp import ClientSession
from mcp.client.sse import sse_client

JOB_ID = "f75d35a2"
SERVER_URL = "http://localhost:3102/sse"

async def run():
    async with sse_client(url=SERVER_URL) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()

            while True:
                result = await session.call_tool("rover_get_pending_chunk", {"job_id": JOB_ID})
                data = json.loads(result.content[0].text)
                if data.get("done"):
                    print("All done!")
                    break
                idx = data["chunk_index"]
                text = data["chunk_text"]
                remaining = data["pending_count"]

                # Skip sidebar/nav chunks
                is_sidebar = len(text) < 200 or "Skip to content" in text[:100] or "Search chats" in text[:300]
                
                if is_sidebar:
                    print(f"Chunk {idx}: {len(text):>5} chars [{remaining:>2} remaining] SKIP")
                    await session.call_tool("rover_submit_extraction", {
                        "job_id": JOB_ID,
                        "chunk_index": idx,
                        "agenda_json": json.dumps({"agenda_items": []}),
                    })
                else:
                    print(f"\n{'='*60}")
                    print(f"Chunk {idx}: {len(text):>5} chars [{remaining:>2} remaining] *** CONTENT ***")
                    print(f"{'='*60}")
                    print(text[:3000])
                    print(f"\n... (truncated, full length {len(text)})")
                    print(f"{'='*60}\n")
                    break  # Stop at first meaningful chunk for me to read

asyncio.run(run())
