#!/usr/bin/env python3
"""
Scan chunks to find Event-Driven CLI Agents conversation content.
"""
import asyncio
import json
import re
from mcp import ClientSession
from mcp.client.sse import sse_client

JOB_ID = "a14e8b8c"

async def run():
    async with sse_client(url="http://localhost:3102/sse") as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()

            # Already done: chunk 0
            # We skipped chunk 1 because it had content but was sidebar
            # Let me submit empty for it and keep scanning
            
            for i in range(1, 150):
                result = await session.call_tool("rover_get_pending_chunk", {
                    "job_id": JOB_ID,
                })
                data = json.loads(result.content[0].text)
                text = data["chunk_text"]
                
                # Skip sidebar/nav chunks
                is_sidebar = len(text) < 200
            
                if is_sidebar:
                    await session.call_tool("rover_submit_extraction", {
                        "job_id": JOB_ID,
                        "chunk_index": data["chunk_index"],
                        "agenda_json": json.dumps({"agenda_items": []}),
                    })
                    continue

                # Look for conversation markers
                has_turn = bool(re.search(r'(user|assistant|system|human|ai):', text[:2000], re.I))
                has_code = "```" in text
                has_edca = "Event-Driven CLI" in text or "event.driven" in text.lower()
                has_backticks = "```" in text
                
                signals = []
                if has_edca: signals.append("EDCA")
                if has_turn: signals.append("TURNS")
                if has_code or has_backticks: signals.append("CODE")
                if "User:" in text[:500] or "user:" in text[:500].lower(): signals.append("USER_MSG")
                
                if signals or len(text) > 1000:
                    signal_str = ",".join(signals) if signals else "BIG"
                    print(f"Chunk {i} ({data['chunk_index']}): {len(text):>6} chars [{signal_str}]")
                    print(f"  Start: {text[:150].strip()}")
                    print()

                    if has_edca or has_turn:
                        print(f"  ===== CONTENT FOUND =====")
                        print(text[:2000])
                        print("  ... (continued)")
                        break

                    await session.call_tool("rover_submit_extraction", {
                        "job_id": JOB_ID,
                        "chunk_index": data["chunk_index"],
                        "agenda_json": json.dumps({"agenda_items": []}),
                    })
                else:
                    await session.call_tool("rover_submit_extraction", {
                        "job_id": JOB_ID,
                        "chunk_index": data["chunk_index"],
                        "agenda_json": json.dumps({"agenda_items": []}),
                    })
            else:
                print("Reached end of chunks without finding content")

asyncio.run(run())
