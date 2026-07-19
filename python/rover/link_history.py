#!/usr/bin/env python3
"""
Create cross-references between ingested history agent_records and candidates.
Runs after ingest_history.py — reads records tagged source:history and links
them to candidates by title similarity.
"""

import json
import re
import sys
import urllib.request
import urllib.error

NEBULA_URL = "http://localhost:3101"


def api_get(path: str) -> dict:
    with urllib.request.urlopen(f"{NEBULA_URL}{path}") as resp:
        return json.loads(resp.read())


def api_post(path: str, data: dict) -> dict:
    payload = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{NEBULA_URL}{path}",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        return {"error": f"{e.code}: {body[:200]}"}


def title_similarity(a: str, b: str) -> float:
    words_a = set(re.findall(r'[a-z]+', a.lower()))
    words_b = set(re.findall(r'[a-z]+', b.lower()))
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    return len(intersection) / min(len(words_a), len(words_b))


def main():
    # Get history records
    print("Fetching history records...")
    records = []
    offset = 0
    while True:
        data = api_get(f"/api/agent-records?limit=100&offset={offset}")
        batch = data.get("records", [])
        if not batch:
            break
        for r in batch:
            if "source:history" in (r.get("tags") or []):
                records.append(r)
        offset += len(batch)
        if len(batch) < 100:
            break

    print(f"Found {len(records)} history records")

    # Get candidates
    print("Fetching candidates...")
    candidates = []
    offset = 0
    while True:
        data = api_get(f"/api/harvest-candidates?limit=100&offset={offset}")
        batch = data.get("candidates", [])
        if not batch:
            break
        candidates.extend(batch)
        offset += len(batch)
        if len(batch) < 100:
            break

    print(f"Found {len(candidates)} candidates")

    # Create cross-references
    xrefs = 0
    for rec in records:
        rec_title = rec.get("title", "")
        for cand in candidates:
            sim = title_similarity(rec_title, cand["title"])
            if sim >= 0.4:
                result = api_post("/api/cross-references", {
                    "sourceType": "agent_record",
                    "sourceId": rec["id"],
                    "targetType": "harvest_candidate",
                    "targetId": cand["id"],
                    "relType": "ag:evidences_candidate",
                    "metadata": {"similarity": round(sim, 3), "source": "history_ingestion"},
                })
                if "error" not in result:
                    xrefs += 1
                    print(f"  {rec_title[:40]}... → {cand['title'][:40]}... (sim={sim:.2f})")
                elif "409" not in str(result.get("error", "")):
                    print(f"  ERROR: {result.get('error', '')[:100]}")

    print(f"\nDone: {xrefs} cross-references created")


if __name__ == "__main__":
    main()
