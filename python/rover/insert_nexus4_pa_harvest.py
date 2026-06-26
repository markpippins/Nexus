#!/usr/bin/env python3
"""Insert Nexus 4 Project Automation harvest into DB."""
import json, subprocess
DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]
def sql_escape(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"

def main():
    with open("/tmp/nexus4_pa_harvest.json") as f:
        data = json.load(f)
    candidates = data["agenda_items"]
    total = len(candidates)
    print(f"Total candidates: {total}")
    
    with open("/tmp/harvest_chunks/nexus4_pa/Nexus_-_Nexus_4_Project_Automation_full.md") as f:
        source_text = f.read()
    print(f"Source text: {len(source_text)} chars")

    source_path = "chats/Nexus - Nexus 4 Project Automation.html"
    source_filename = "Nexus - Nexus 4 Project Automation.html"
    model = "opencode/big-pickle"
    tags = ["opencode", "inference-engine", "architect", "harvest", "nexus4_project_automation"]
    metadata = {"total_chunks": 1, "source_format": "docling+chunk40k+overlap4k", "inference_engine": "opencode/big-pickle", "role": "architect"}

    cj = json.dumps(candidates, ensure_ascii=False)
    mj = json.dumps(metadata, ensure_ascii=False)
    tl = ", ".join(sql_escape(t) for t in tags)
    ta = f"ARRAY[{tl}]"

    sql = f"""INSERT INTO nebula.harvests (source_path, source_filename, model, total_candidates, candidates, source_text, tags, metadata) VALUES ({sql_escape(source_path)}, {sql_escape(source_filename)}, {sql_escape(model)}, {total}, {sql_escape(cj)}::jsonb, {sql_escape(source_text)}::text, {ta}::text[], {sql_escape(mj)}::jsonb) RETURNING id, source_filename, total_candidates, created_at;"""

    r = subprocess.run(DOCKER_PSQL + ["-t", "-A"], input=sql, capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        print(f"INSERT failed: {r.stderr.strip()}")
        return
    out = r.stdout.strip()
    if out:
        parts = out.split("|")
        print(f"INSERTED harvest {parts[0]} | {parts[1]} | {parts[2]} candidates at {parts[3]}")
        print("✅ Nexus 4 Project Automation harvest inserted")
    else:
        print("INSERT returned no output")

if __name__ == "__main__":
    main()
