#!/usr/bin/env python3
"""
Insert the WRP Conduit Integration Plan harvest into the database.
Uses the inference engine extraction from /tmp/wrp_harvest_chunk1.json
"""
import json
import subprocess

DOCKER_PSQL = [
    "docker", "exec", "-i", "pgvector_db",
    "psql", "-U", "pguser", "-d", "nexus",
]

def sql_escape(val):
    if val is None:
        return "NULL"
    return "'" + str(val).replace("'", "''") + "'"

def insert_harvest(source_path, source_filename, model, total_candidates, candidates_json, source_text, tags, metadata):
    # Build tags array
    tag_literals = ", ".join(sql_escape(t) for t in tags)
    tags_array = f"ARRAY[{tag_literals}]"
    metadata_json = json.dumps(metadata, ensure_ascii=False)
    source_text_escaped = sql_escape(source_text or "")

    sql = f"""
    INSERT INTO nebula.harvests
        (source_path, source_filename, model, total_candidates,
         candidates, source_text, tags, metadata)
    VALUES
        ({sql_escape(source_path)},
         {sql_escape(source_filename)},
         {sql_escape(model)},
         {total_candidates},
         {sql_escape(candidates_json)}::jsonb,
         {source_text_escaped}::text,
         {tags_array}::text[],
         {sql_escape(metadata_json)}::jsonb)
    RETURNING id, source_filename, total_candidates, created_at;
    """

    result = subprocess.run(
        DOCKER_PSQL + ["-t", "-A"],
        input=sql, capture_output=True, text=True, timeout=60,
    )

    if result.returncode != 0:
        print(f"INSERT failed: {result.stderr.strip()}")
        return None

    out = result.stdout.strip()
    if out:
        parts = out.split("|")
        print(f"INSERTED harvest {parts[0]} | {parts[1]} | {parts[2]} candidates at {parts[3]}")
        return {"id": parts[0], "filename": parts[1], "candidates": int(parts[2])}
    else:
        print("INSERT returned no output")
        return None

def main():
    # Load the extraction JSON
    with open("/tmp/wrp_harvest_chunk1.json") as f:
        data = json.load(f)

    candidates = data["agenda_items"]
    total = len(candidates)
    print(f"Total candidates: {total}")

    # Read the source markdown from chunk output
    md_path = "/tmp/harvest_chunks/wrp/full_markdown.md"
    try:
        with open(md_path) as f:
            source_text = f.read()[:50000]  # Keep reasonable size
    except FileNotFoundError:
        source_text = None
        print("Warning: full_markdown.md not found")

    source_path = "chats/WRP Conduit Integration Plan.html"
    source_filename = "WRP Conduit Integration Plan.html"
    model = "opencode/big-pickle"  # inference engine = me

    tags = ["opencode", "inference-engine", "architect", "wrp", "harvest", "wrp_conduit_integration_plan"]
    metadata = {
        "total_chunks": 9,
        "source_format": "docling+chunk40k+overlap4k",
        "inference_engine": "opencode/big-pickle",
        "role": "architect",
    }

    result = insert_harvest(
        source_path=source_path,
        source_filename=source_filename,
        model=model,
        total_candidates=total,
        candidates_json=json.dumps(candidates, ensure_ascii=False),
        source_text=source_text,
        tags=tags,
        metadata=metadata,
    )

    if result:
        print(f"✅ WRP harvest inserted: {result['id']}")
    else:
        print("❌ Failed to insert WRP harvest")

if __name__ == "__main__":
    main()
