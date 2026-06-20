#!/usr/bin/env python3
"""
MCP client for rover-mcp SSE server.

Usage:
    ./rover_client.py submit /path/to/transcript.html
    ./rover_client.py job_status <job_id>
    ./rover_client.py get_chunk <job_id>
    ./rover_client.py submit_extraction <job_id> <chunk_index> <agenda.json>
    ./rover_client.py compile <job_id> <output_path>
"""

import asyncio
import json
import sys
from mcp import ClientSession
from mcp.client.sse import sse_client


async def main():
    args = sys.argv[1:]
    if not args:
        print("Usage: rover_client.py <command> [args...]")
        print("Commands: submit, job_status, get_chunk, submit_extraction, compile")
        sys.exit(1)

    command = args[0]
    server_url = "http://localhost:3102/sse"

    async with sse_client(url=server_url) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()

            if command == "submit":
                transcript_path = args[1]
                result = await session.call_tool("rover_submit_transcript",
                    {"transcript_path": transcript_path})
                print(result.content[0].text)

            elif command == "job_status":
                job_id = args[1]
                result = await session.call_tool("rover_job_status",
                    {"job_id": job_id})
                print(result.content[0].text)

            elif command == "get_chunk":
                job_id = args[1]
                result = await session.call_tool("rover_get_pending_chunk",
                    {"job_id": job_id})
                print(result.content[0].text)

            elif command == "submit_extraction":
                job_id = args[1]
                chunk_index = int(args[2])
                agenda_json = args[3]
                result = await session.call_tool("rover_submit_extraction", {
                    "job_id": job_id,
                    "chunk_index": chunk_index,
                    "agenda_json": agenda_json,
                })
                print(result.content[0].text)

            elif command == "compile":
                job_id = args[1]
                output_path = args[2]
                result = await session.call_tool("rover_compile_agenda", {
                    "job_id": job_id,
                    "output_path": output_path,
                })
                print(result.content[0].text)

            else:
                print(f"Unknown command: {command}")
                sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
