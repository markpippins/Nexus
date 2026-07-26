#!/usr/bin/env python3
"""Quick smoke test for rover_mcp_server — exercises the job queue flow."""

import asyncio
import json
import sys
sys.path.insert(0, ".")

# Test 1: verify imports and tool registration
from rover_mcp_server import (
    mcp, _jobs, _new_job_id,
    rover_submit_transcript,
    rover_get_pending_chunk,
    rover_submit_extraction,
    rover_compile_agenda,
    rover_job_status,
)
from datetime import datetime, timezone

from schemas import SpecificationAgenda, SpecificationCandidate, HarvestedCode


async def main():
    print("=== Test 1: Tool registration ===")
    print(f"Server name: {mcp.name}")
    rover_tools = [
        rover_submit_transcript,
        rover_get_pending_chunk,
        rover_submit_extraction,
        rover_compile_agenda,
        rover_job_status,
    ]
    for t in rover_tools:
        print(f"  ✓ {t.__name__}")
    print(f"rover tools found: {len(rover_tools)}")

    # Test 2: unknown job_id
    print("\n=== Test 2: Unknown job_id ===")
    result = json.loads(await rover_get_pending_chunk("bad-id"))
    assert "error" in result, f"Expected error, got {result}"
    print(f"OK — rejected unknown job_id: {result['error']}")

    result = json.loads(rover_job_status("bad-id"))
    assert "error" in result
    print(f"OK — job_status rejects unknown: {result['error']}")

    # Test 3: submit_extraction with bad JSON
    print("\n=== Test 3: Bad JSON ===")
    # Manually inject a mock job so we can test submission
    job_id = _new_job_id()
    _jobs[job_id] = {
        "transcript_path": "test.html",
        "chunks": ["chunk 0 text", "chunk 1 text"],
        "extractions": {},
        "total_chunks": 2,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    result = json.loads(rover_submit_extraction(job_id, 0, "not json at all"))
    assert "error" in result, f"Expected error, got {result}"
    print(f"OK — rejected bad JSON: {result['error'][:60]}...")

    # Test 4: valid extraction
    print("\n=== Test 4: Valid extraction ===")
    agenda = SpecificationAgenda(agenda_items=[
        SpecificationCandidate(
            title="Test Feature",
            status="Proposed",
            intent_description="A test specification candidate.",
            requirements=["Must pass tests"],
            implementation_notes=["Use Python"],
            code_snippets=[
                HarvestedCode(
                    language="python",
                    purpose="Demonstration",
                    raw_code="print('hello')"
                )
            ],
            open_questions=["Is this tested enough?"]
        )
    ])
    agenda_json = json.dumps(agenda.model_dump())
    result = json.loads(rover_submit_extraction(job_id, 0, agenda_json))
    assert "error" not in result, f"Unexpected error: {result}"
    assert result["remaining_chunks"] == 1
    print(f"OK — chunk 0 stored, {result['remaining_chunks']} remaining")

    # Test 5: get_pending_chunk — should return chunk 1
    print("\n=== Test 5: Pending chunk ===")
    result = json.loads(await rover_get_pending_chunk(job_id))
    assert result["chunk_index"] == 1, f"Expected chunk 1, got {result['chunk_index']}"
    assert "chunk_text" in result
    print(f"OK — got pending chunk {result['chunk_index']} (completed: {result['completed_count']})")

    # Test 6: submit chunk 1
    result = json.loads(rover_submit_extraction(job_id, 1, agenda_json))
    assert result["remaining_chunks"] == 0
    print(f"OK — chunk 1 stored, {result['remaining_chunks']} remaining")
    assert "compile_agenda" in result["next"].lower()
    print(f"    → {result['next']}")

    # Test 7: compile_agenda
    print("\n=== Test 7: Compile agenda ===")
    import tempfile, os
    output = os.path.join(tempfile.mkdtemp(), "test_agenda.md")
    result = json.loads(rover_compile_agenda(job_id, output))
    assert result["total_candidates"] == 2, f"Expected 2 candidates, got {result['total_candidates']}"
    print(f"OK — wrote {output}: {result['total_candidates']} candidates, {result['failed_chunks']} failed")

    # Verify output file
    with open(output) as f:
        content = f.read()
    assert "# Harvested Specification & Code Repository" in content
    assert "Test Feature" in content
    assert "```python" in content
    print(f"OK — output file contains expected sections ({len(content)} chars)")

    # Test 8: job_status
    print("\n=== Test 8: job_status ===")
    result = json.loads(rover_job_status(job_id))
    assert result["done"] is True
    print(f"OK — job done: {result['completed_chunks']}/{result['total_chunks']} chunks")

    # Test 9: get_pending_chunk when all done
    print("\n=== Test 9: All chunks done ===")
    result = json.loads(await rover_get_pending_chunk(job_id))
    assert result.get("done") is True
    print(f"OK — reports done, suggests compile: {'compile_agenda' in result.get('next', '')}")

    # Cleanup
    _jobs.clear()

    print("\n=== ALL 9 TESTS PASSED ===")


if __name__ == "__main__":
    asyncio.run(main())
