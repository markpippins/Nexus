#!/usr/bin/env python3
"""
Insert the Cognitive Runtime OLAP Integration Strategy - Google Gemini harvest.
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

def main():
    with open("/tmp/cognitive_olap_harvest.json") as f:
        data = json.load(f)

    candidates = data["agenda_items"]
    total = len(candidates)
    print(f"Total candidates: {total}")

    # Read the source markdown
    md_path = "/tmp/harvest_chunks/cognitive_olap/Cognitive_Runtime_OLAP_Integration_Strategy_-_Google_Gemini_full.md"
    try:
        with open(md_path) as f:
            source_text = f.read()
        print(f"Source text: {len(source_text)} chars")
    except FileNotFoundError:
        source_text = ""
        print("Warning: full markdown not found")

    source_path = "chats/Cognitive Runtime OLAP Integration Strategy - Google Gemini.html"
    source_filename = "Cognitive Runtime OLAP Integration Strategy - Google Gemini.html"
    model = "opencode/big-pickle"

    tags = ["opencode", "inference-engine", "architect", "harvest", "cognitive_olap_gemini"]
    metadata = {
        "total_chunks": 1,
        "source_format": "docling+chunk40k+overlap4k",
        "inference_engine": "opencode/big-pickle",
        "role": "architect",
    }

    candidates_json = json.dumps(candidates, ensure_ascii=False)
    metadata_json = json.dumps(metadata, ensure_ascii=False)

    tag_literals = ", ".join(sql_escape(t) for t in tags)
    tags_array = f"ARRAY[{tag_literals}]"

    sql = f"""
    INSERT INTO nebula.harvests
        (source_path, source_filename, model, total_candidates,
         candidates, source_text, tags, metadata)
    VALUES
        ({sql_escape(source_path)},
         {sql_escape(source_filename)},
         {sql_escape(model)},
         {total},
         {sql_escape(candidates_json)}::jsonb,
         {sql_escape(source_text)}::text,
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
        return

    out = result.stdout.strip()
    if out:
        parts = out.split("|")
        print(f"INSERTED harvest {parts[0]} | {parts[1]} | {parts[2]} candidates at {parts[3]}")
        print("✅ Cognitive OLAP harvest inserted")
    else:
        print("INSERT returned no output")

if __name__ == "__main__":
    main()
