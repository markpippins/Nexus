#!/usr/bin/env python3
"""
Skip through chunks until we find actual conversation content.
Submit empty extractions for sidebar/nav chunks.
"""
import asyncio
import json
from mcp import ClientSession
from mcp.client.sse import sse_client

JOB_ID = "a14e8b8c"

async def run():
    async with sse_client(url="http://localhost:3102/sse") as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()

            # Chunk 0 is done. Now process until we find real content.
            for i in range(1, 20):
                result = await session.call_tool("rover_get_pending_chunk", {
                    "job_id": JOB_ID,
                })
                data = json.loads(result.content[0].text)
                text = data["chunk_text"]
                
                # Check if this looks like real conversation
                has_real_content = any(marker in text for marker in [
                    "Event-Driven", "CLI Agents", "architect",
                    "```", "specification", "work request", "pipeline"
                ])
                
                if has_real_content:
                    print(f"Chunk {i}: {len(text)} chars - HAS CONTENT")
                    print(f"Preview: {text[:500]}")
                    print("---END---")
                    break
                else:
                    print(f"Chunk {i}: {len(text)} chars - SKIP (sidebar/nav)")
                    await session.call_tool("rover_submit_extraction", {
                        "job_id": JOB_ID,
                        "chunk_index": data["chunk_index"],
                        "agenda_json": json.dumps({"agenda_items": []}),
                    })
            else:
                print("No content found in first 20 chunks")

asyncio.run(run())
