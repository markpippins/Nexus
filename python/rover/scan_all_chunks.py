#!/usr/bin/env python3
"""
Scan ALL remaining LOSM chunks: classify as sidebar/noise or content,
dump content chunks to files for analysis, auto-skip noise.
"""
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

def is_noise(text: str) -> bool:
    """Detect sidebar/nav/empty chunks."""
    if len(text) < 300:
        return True
    head = text[:500]
    noise_indicators = [
        "Skip to content", "Search chats", "Search transcript",
        "New chat", "Profile", "Settings", "Sign out",
        "All chats", "Today", "Yesterday", "Previous 7 days",
        "Chats", "Filters", "navigation", "sidebar",
    ]
    for ind in noise_indicators:
        if ind.lower() in head.lower():
            return True
    return False

async def run():
    async with sse_client(url=SERVER_URL) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()

            # Get status first
            result = await session.call_tool("rover_job_status", {"job_id": JOB_ID})
            status = json.loads(result.content[0].text)
            print(f"Job: {JOB_ID}")
            print(f"Total chunks: {status['total_chunks']}")
            print(f"Completed: {status['completed_chunks']}")
            print(f"Pending: {status['pending_chunks']}")
            print("=" * 60)

            content_count = 0
            noise_count = 0

            while True:
                result = await session.call_tool("rover_get_pending_chunk", {"job_id": JOB_ID})
                data = json.loads(result.content[0].text)

                if data.get("done"):
                    print("\nAll chunks processed!")
                    break

                idx = data["chunk_index"]
                text = data["chunk_text"]
                remaining = data["pending_count"]

                if is_noise(text):
                    # Auto-submit empty for noise
                    noise_count += 1
                    print(f"[{remaining:>2} remaining] Chunk {idx:>2}: {len(text):>6} chars — NOISE (auto-skip)")
                    sub_result = await session.call_tool("rover_submit_extraction", {
                        "job_id": JOB_ID,
                        "chunk_index": idx,
                        "agenda_json": json.dumps({"agenda_items": []}),
                    })
                    sub_data = json.loads(sub_result.content[0].text)
                    if sub_data.get("remaining_chunks", 1) == 0:
                        print("→ All chunks done after this noise skip!")
                else:
                    content_count += 1
                    # Dump to file
                    out_path = OUT_DIR / f"chunk-{idx:02d}.txt"
                    out_path.write_text(text)

                    # Print a preview
                    preview = text[:2000]
                    if len(text) > 2000:
                        preview += f"\n\n[... truncated, full length {len(text)} chars ...]"
                    print(f"\n{'='*60}")
                    print(f"[{remaining:>2} remaining] Chunk {idx:>2}: {len(text):>6} chars — *** CONTENT ***")
                    print(f"{'='*60}")
                    print(preview)
                    print(f"{'='*60}")
                    print(f"\n→ Saved to {out_path}")
                    # Do NOT auto-submit — agent needs to analyze and submit extraction

            print(f"\n{'='*60}")
            print(f"Summary: {content_count} content chunks, {noise_count} noise chunks")
            print(f"Content chunks saved to {OUT_DIR}/")
            if content_count > 0:
                print("\nNEXT: Submit extractions for each content chunk via:")
                print("  rover_submit_extraction(job_id, chunk_index, agenda_json)")

asyncio.run(run())
