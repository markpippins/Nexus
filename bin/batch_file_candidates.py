#!/usr/bin/env python3
"""
Batch File Candidates — Stage 2 Inference

Reads docklang from nebula.harvests, uses Gemini to identify candidate-worthy
architectural concepts, maps them to the Nebula hierarchy (systems/subsystems/
features), creates harvest candidates via the nebula-srv REST API, and
optionally publishes to the Assembly forum.

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate
    python3 bin/batch_file_candidates.py [--dry-run] [--limit N] [--batch N] [--publish]
"""

import argparse
import json
import logging
import subprocess
import sys
import time
from pathlib import Path

from tackle.inference import call_llm
from event_emitter import emit_candidate_discovered

log = logging.getLogger("batch_file_candidates")

PROJECT_ROOT = Path("/home/codex/dev")
DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]
NEBULA_API = "http://localhost:3101/api"
# Model config resolved via tackle-mcp (role: Rover)
# See tackle/inference.py and config bundles at POST /config/ai/bundles/:role

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)


def psql(sql: str, timeout: int = 30) -> tuple[int, str]:
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, result.stdout.strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)"


def nebula_get(path: str) -> dict | list:
    import urllib.request
    url = f"{NEBULA_API}{path}"
    with urllib.request.urlopen(url, timeout=15) as r:
        return json.loads(r.read().decode())


def nebula_post(path: str, body: dict) -> dict:
    import urllib.request, urllib.error
    url = f"{NEBULA_API}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode() if e.fp else "(no body)"
        log.error("  Nebula API %s %s: %s", e.code, path, body_text[:500])
        return {"error": True, "status": e.code, "body": body_text[:500]}


# Gemini call replaced by tackle.inference.call_llm — resolves model config
# via tackle-mcp config bundles / config/ai/resolve/:role (port 3400).


def check_filename_dedup(filenames: list[str]) -> dict[str, str]:
    """Pre-inference dedup check: for each filename, check if existing
    candidates from that filename (if any) are already duplicates of
    intent_records or implementation_plans.

    Returns a dict mapping filename -> skip_reason (or absent = don't skip).
    A filename is skipped if its existing candidates already match
    intent_records, meaning another LLM pass would just produce more
    duplicates.
    """
    if not filenames:
        return {}

    # Format filenames for SQL IN clause
    fn_list = ",".join(f"'{fn.replace(chr(39), chr(39)+chr(39))}'" for fn in filenames)

    # For each filename, find existing candidate titles and check if
    # they match intent_records (trigram > 0.6)
    sql = f"""
    WITH existing AS (
        SELECT hc.title, h.source_filename
        FROM nebula.harvest_candidates hc
        JOIN nebula.harvests h ON hc.harvest_id = h.id
        WHERE h.source_filename IN ({fn_list})
    )
    SELECT DISTINCT e.source_filename
    FROM existing e
    WHERE EXISTS (
        SELECT 1 FROM nebula.intent_records ir
        WHERE similarity(ir.title, e.title) > 0.6
    )
    """
    rc, out = psql(sql)
    if rc != 0 or not out:
        return {}

    skip_map = {}
    for line in out.splitlines():
        fn = line.strip()
        if fn:
            skip_map[fn] = "existing candidates already match intent_records"
    return skip_map


def fetch_hierarchy() -> list[dict]:
    systems = nebula_get("/systems")
    if not systems:
        log.error("Failed to fetch Nebula hierarchy")
        return []
    log.info("Fetched hierarchy: %d systems", len(systems))
    return systems


def build_hierarchy_text(systems: list[dict]) -> str:
    lines = ["Systems:"]
    for s in systems:
        sid = s["id"][:8]
        subsystems = s.get("subsystems", [])
        if not subsystems:
            lines.append(f"  [{sid}] {s['name']}")
        else:
            lines.append(f"  [{sid}] {s['name']}")
            for sub in subsystems:
                subid = sub["id"][:8]
                features = sub.get("features", [])
                if not features:
                    lines.append(f"    [{subid}] {sub['name']}")
                else:
                    lines.append(f"    [{subid}] {sub['name']}")
                    for f in features:
                        lines.append(f"      [{f['id'][:8]}] {f['name']}")
    return "\n".join(lines)


def summarize_docklang(docklang: dict) -> str:
    stats = docklang.get("stats", {})
    units = docklang.get("discourse_units", [])
    
    parts = [
        f"Conversation: {len(units)} turns, {stats.get('total_blocks', 0)} blocks.",
        f"Types: {json.dumps(stats.get('by_type', {}))}",
    ]
    
    for i, unit in enumerate(units):
        heading = unit.get("heading", f"Turn {i+1}")[:80]
        blocks = unit.get("blocks", [])
        texts = []
        for b in blocks:
            t = b.get("type", "")
            c = b.get("content", "")
            if t == "code":
                lang = c.get("language", "") if isinstance(c, dict) else ""
                code_text = c.get("code", str(c)) if isinstance(c, dict) else str(c)
                texts.append(f"[CODE:{lang}] {code_text[:200]}")
            elif t in ("paragraph", "list", "quote"):
                txt = c.get("text", str(c)) if isinstance(c, dict) else str(c)
                txt = txt.strip()[:300]
                if txt:
                    texts.append(txt)
            elif t == "diagram":
                texts.append("[DIAGRAM]")
        
        combined = " | ".join(texts[:8])
        if combined:
            parts.append(f"T{i+1} ({heading}): {combined[:800]}")
    
    return "\n".join(parts)


def get_unfiled_harvests(limit: int = None, skip_unchanged: bool = False) -> tuple[list[dict], list[str]]:
    """Query harvests with docklang that have no existing candidates.
    Uses direct SQL exclusion (NOT IN subquery) — immune to API limits.
    
    If skip_unchanged=True, also excludes harvests whose same-filename
    predecessor at the same file_size already has candidates (re-ingestion
    of unchanged content). Returns (harvests, skipped_filenames).
    """
    sql = """
    SELECT h.id, h.source_filename, h.file_size
    FROM nebula.harvests h
    WHERE h.docklang IS NOT NULL
      AND h.id NOT IN (
        SELECT DISTINCT harvest_id
        FROM nebula.harvest_candidates
        WHERE harvest_id IS NOT NULL
      )
    ORDER BY h.created_at DESC
    """
    rc, out = psql(sql)
    if rc != 0:
        log.error("Failed to query harvests")
        return [], []

    harvests = []
    if out:  # 0 results is valid, not an error
        for line in out.splitlines():
            parts = line.split("|")
            if len(parts) >= 2:
                h = {"id": parts[0], "filename": parts[1]}
                if len(parts) >= 3 and parts[2]:
                    try:
                        h["file_size"] = int(parts[2])
                    except ValueError:
                        pass
                harvests.append(h)

    # Also query total for logging
    rc2, out2 = psql("SELECT COUNT(*) FROM nebula.harvests WHERE docklang IS NOT NULL;")
    total = int(out2) if rc2 == 0 and out2 else 0

    # File-size-based skip/reharvest: for each unfiled harvest, compare
    # against the largest predecessor that already has candidates.
    #   - Same size → skip (unchanged content)
    #   - Current larger → reharvest (new content added to transcript)
    #   - Current smaller → skip (truncated or rolled back)
    skipped = []
    reharvested = []
    if skip_unchanged:
        remaining = []
        for h in harvests:
            fs = h.get("file_size")
            if fs is None:
                remaining.append(h)
                continue
            fn_escaped = h["filename"].replace(chr(39), chr(39)+chr(39))
            # Find the largest file_size among predecessors with candidates
            rc3, out3 = psql(f"""
                SELECT MAX(file_size) FROM nebula.harvests
                WHERE source_filename = '{fn_escaped}'
                  AND id != '{h["id"]}'
                  AND file_size IS NOT NULL
                  AND id IN (SELECT DISTINCT harvest_id FROM nebula.harvest_candidates);
            """)
            if rc3 == 0 and out3 and out3.strip() and out3.strip() != "":
                try:
                    prev_max = int(out3.strip())
                except ValueError:
                    remaining.append(h)
                    continue

                if fs == prev_max:
                    log.info("  Skip (unchanged): %s (%d bytes) — predecessor has candidates",
                             h["filename"], fs)
                    skipped.append(h["filename"])
                elif fs > prev_max:
                    log.info("  Reharvest: %s (%d → %d bytes) — larger version detected",
                             h["filename"], prev_max, fs)
                    reharvested.append(h["filename"])
                    remaining.append(h)
                else:
                    log.info("  Skip (smaller): %s (%d < %d bytes) — truncated or rolled back",
                             h["filename"], fs, prev_max)
                    skipped.append(h["filename"])
            else:
                # No predecessor with candidates — first time processing
                remaining.append(h)
        harvests = remaining

    # Pre-inference dedup: skip filenames whose existing candidates already
    # match intent_records. Another LLM pass would just produce duplicates.
    dedup_skipped = []
    if harvests:
        filenames = list(set(h["filename"] for h in harvests))
        skip_map = check_filename_dedup(filenames)
        if skip_map:
            remaining = []
            for h in harvests:
                reason = skip_map.get(h["filename"])
                if reason:
                    dedup_skipped.append(h["filename"])
                    log.info("  Skip (dedup): %s — %s", h["filename"], reason)
                else:
                    remaining.append(h)
            harvests = remaining

    log.info("Unfiled: %d / %d harvests (direct SQL exclusion)", len(harvests), total)
    if skipped:
        log.info("Skipped (unchanged/smaller): %d", len(skipped))
    if reharvested:
        log.info("Reharvest (larger version): %d", len(reharvested))
    if dedup_skipped:
        log.info("Skipped (pre-inference dedup): %d", len(dedup_skipped))
    all_skipped = skipped + dedup_skipped
    if limit:
        harvests = harvests[:limit]
    return harvests, all_skipped


def get_docklang(harvest_id: str) -> dict | None:
    rc, out = psql(f"SELECT docklang FROM nebula.harvests WHERE id = '{harvest_id}';")
    if rc != 0 or not out:
        return None
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return None


CANDIDATE_PROMPT = """You are a software architect analyzing design conversation transcripts. Extract candidate-worthy architectural concepts and map them to the project hierarchy.

NEBULA HIERARCHY:
{hierarchy}

CONVERSATIONS:
{summary}

For each conversation, identify 0-3 architectural candidates. A candidate must have clear significance and enough detail to be actionable. Map each to the most specific hierarchy node.

Respond with ONLY a JSON array. No markdown, no explanation, no code fences.
Format:
[
  {{
    "title": "Short action-oriented title",
    "intentDescription": "1-3 sentence description",
    "systemMatch": "System name from hierarchy or null",
    "subsystemMatch": "Subsystem name or null",
    "featureMatch": "Feature name or null",
    "status": "pending",
    "tags": ["harvest-candidate", "dockling"]
  }}
]

Return [] if there are no actionable architectural concepts."""


def resolve_hierarchy_ids(candidates: list[dict], systems: list[dict]) -> list[dict]:
    sys_by_name = {}
    sub_by_name = {}
    feat_by_name = {}
    
    for s in systems:
        sname_lower = s["name"].lower()
        sys_by_name[sname_lower] = s["id"]
        for sub in s.get("subsystems", []):
            subname_lower = sub["name"].lower()
            sub_by_name[f"{sname_lower}::{subname_lower}"] = sub["id"]
            sub_by_name[subname_lower] = sub["id"]
            for f in sub.get("features", []):
                fname_lower = f["name"].lower()
                feat_by_name[f"{subname_lower}::{fname_lower}"] = f["id"]
                feat_by_name[f"{sname_lower}::{subname_lower}::{fname_lower}"] = f["id"]

    resolved = []
    for c in candidates:
        r = {
            "title": c.get("title", "Untitled"),
            "intentDescription": c.get("intentDescription", ""),
            "status": c.get("status", "pending"),
            "tags": c.get("tags", ["harvest-candidate", "dockling"]),
            "systemId": None, "subsystemId": None, "featureId": None,
        }
        sys_n = (c.get("systemMatch") or "").lower().strip()
        sub_n = (c.get("subsystemMatch") or "").lower().strip()
        feat_n = (c.get("featureMatch") or "").lower().strip()
        
        if feat_n:
            if sub_n and f"{sub_n}::{feat_n}" in feat_by_name:
                r["featureId"] = feat_by_name[f"{sub_n}::{feat_n}"]
            if feat_n in feat_by_name:
                r["featureId"] = r["featureId"] or feat_by_name[feat_n]
        if sub_n:
            if sys_n and f"{sys_n}::{sub_n}" in sub_by_name:
                r["subsystemId"] = sub_by_name[f"{sys_n}::{sub_n}"]
            if sub_n in sub_by_name:
                r["subsystemId"] = r["subsystemId"] or sub_by_name[sub_n]
        if sys_n and sys_n in sys_by_name:
            r["systemId"] = sys_by_name[sys_n]
        
        resolved.append(r)
    return resolved


def create_candidate(harvest_id: str, candidate: dict) -> str | None:
    """Create a candidate via the nebula-srv REST API.

    Returns the candidate UUID on success, None on failure.
    """
    body = {"harvestId": harvest_id, **candidate}
    for k in ["systemMatch", "subsystemMatch", "featureMatch"]:
        body.pop(k, None)
    result = nebula_post("/harvest-candidates", body)
    if isinstance(result, dict) and result.get("error"):
        return None
    # API returns the full row with 'id'
    return result.get("id")


ASSEMBLY_MCP_URL = "http://localhost:3112"


def assembly_mcp_call(method: str, params: dict) -> dict:
    """Call an MCP tool on the assembly-mcp server via JSON-RPC over HTTP."""
    import urllib.request, urllib.error
    payload = json.dumps({
        "jsonrpc": "2.0",
        "id": "1",
        "method": method,
        "params": params,
    }).encode("utf-8")
    req = urllib.request.Request(
        ASSEMBLY_MCP_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode() if e.fp else "(no body)"
        log.error("  Assembly MCP %s: %s", method, body_text[:500])
        return {"error": True, "status": e.code, "body": body_text[:500]}
    except Exception as e:
        log.error("  Assembly MCP call failed: %s", e)
        return {"error": True}


def publish_harvest_to_forum(harvest_id: str) -> bool:
    """Call assembly_publish_harvest MCP tool to create a forum post."""
    result = assembly_mcp_call("tools/call", {
        "name": "assembly_publish_harvest",
        "arguments": {"harvest_id": harvest_id},
    })
    if isinstance(result, dict) and result.get("error"):
        return False
    # Successful response looks like: {"jsonrpc":"2.0","id":"1","result":{"content":[{"text":"..."}]}}
    content = result.get("result", {}).get("content", [])
    if content:
        log.info("  Forum post result: %s", content[0].get("text", "")[:200])
    return True


def main():
    parser = argparse.ArgumentParser(description="Batch file candidates")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--batch", type=int, default=3)
    parser.add_argument("--resume", type=str, default=None,
                        help="Resume from a specific harvest ID")
    parser.add_argument("--resume-file", type=str, default=None,
                        help="Resume from a specific source_filename (immune to UUID changes)")
    parser.add_argument("--publish", action="store_true", default=False,
                        help="Publish harvests to Assembly forum after creating candidates")
    parser.add_argument("--skip-unchanged", action="store_true", default=False,
                        help="Skip harvests whose same-filename predecessor at same file_size already has candidates")
    args = parser.parse_args()
    
    log.info("=" * 60)
    log.info("Batch File Candidates — Stage 2 Inference")
    log.info("Model: resolved by tackle-mcp for role Rover | Batch: %d", args.batch)
    
    systems = fetch_hierarchy()
    if not systems:
        return 1
    hierarchy_text = build_hierarchy_text(systems)
    
    harvests, skipped = get_unfiled_harvests(args.limit, args.skip_unchanged)
    if not harvests:
        log.info("No unfiled harvests.")
        return 0
    
    if args.resume_file:
        try:
            idx = next(i for i, h in enumerate(harvests) if h["filename"] == args.resume_file)
            log.info("Resuming from file: %s (position %d/%d)", args.resume_file, idx + 1, len(harvests))
            harvests = harvests[idx:]
        except StopIteration:
            log.warning("Resume file not found: %s", args.resume_file)
    elif args.resume:
        try:
            idx = next(i for i, h in enumerate(harvests) if h["id"] == args.resume)
            log.info("Resuming from ID: %s (position %d/%d)", args.resume[:8], idx + 1, len(harvests))
            harvests = harvests[idx:]
        except StopIteration:
            log.warning("Resume ID not found: %s", args.resume[:8])
    
    if args.dry_run:
        for h in harvests:
            log.info("  %s (%s)", h["filename"], h["id"][:8])
        return 0
    
    total_candidates = 0
    results = {}
    
    for i in range(0, len(harvests), args.batch):
        batch = harvests[i:i+args.batch]
        batch_label = f"[{i+1}-{min(i+args.batch, len(harvests))}/{len(harvests)}]"
        log.info("%s Processing %d harvests", batch_label, len(batch))
        
        summaries = []
        for h in batch:
            dl = get_docklang(h["id"])
            if dl:
                summaries.append(f"=== HARVEST: {h['filename']} (id:{h['id'][:8]}) ===\n{summarize_docklang(dl)}")
            else:
                results[h["id"]] = (0, 0)
        
        if not summaries:
            continue
        
        combined = "\n\n".join(summaries)
        prompt = CANDIDATE_PROMPT.format(hierarchy=hierarchy_text, summary=combined)
        log.info("  Prompt: %d chars", len(prompt))
        
        start = time.time()
        response = call_llm(prompt, role="Rover", temperature=0.1, max_tokens=8192)
        elapsed = time.time() - start
        
        if not response:
            for h in batch:
                results[h["id"]] = (0, elapsed)
            continue
        
        response = response.strip()
        if response.startswith("```"):
            response = response.split("\n", 1)[-1]
            if "```" in response:
                response = response.rsplit("```", 1)[0]
        response = response.strip()
        
        try:
            candidates = json.loads(response)
            if not isinstance(candidates, list):
                candidates = [candidates]
        except json.JSONDecodeError:
            import re
            match = re.search(r'\[.*?\]', response, re.DOTALL)
            if match:
                try:
                    candidates = json.loads(match.group())
                except json.JSONDecodeError:
                    log.warning("  Could not parse response")
                    for h in batch:
                        results[h["id"]] = (0, elapsed)
                    continue
            else:
                log.warning("  No JSON array in response")
                for h in batch:
                    results[h["id"]] = (0, elapsed)
                continue
        
        log.info("  LLM: %d candidates in %.1fs", len(candidates), elapsed)
        
        # Distribute candidates to harvests
        harvest_cands = {h["id"]: [] for h in batch}
        for cd in candidates:
            matched = False
            for h in batch:
                base = h["filename"].lower().replace(".html", "").replace(" - ", " ").replace("-", " ")
                keywords = [w for w in base.split() if len(w) > 3]
                t = (cd.get("title") or "").lower()
                d = (cd.get("intentDescription") or "").lower()
                if any(kw in t or kw in d for kw in keywords):
                    harvest_cands[h["id"]].append(cd)
                    matched = True
                    break
            if not matched:
                harvest_cands[batch[0]["id"]].append(cd)
        
        for h in batch:
            cands = harvest_cands.get(h["id"], [])
            if not cands:
                results[h["id"]] = (0, elapsed)
                continue
            
            resolved = resolve_hierarchy_ids(cands, systems)
            created = 0
            for c in resolved:
                cand_id = create_candidate(h["id"], c)
                if cand_id:
                    created += 1
                    total_candidates += 1

                    # Cascade event: candidate.discovered
                    emit_candidate_discovered(
                        candidate_id=cand_id,
                        harvest_id=h["id"],
                        title=c.get("title", ""),
                        cpf=c.get("compilationReadiness"),
                        source="rover.batch_file_candidates",
                    )
            results[h["id"]] = (created, elapsed)
            
            # ── Emit observation.captured kernel event ──
            # This proves the nervous system: the organization notices
            # that something happened. Cascade subscribers will assess
            # and potentially surface via Assembly.
            if created > 0:
                try:
                    import uuid as _uuid
                    obs_id = str(_uuid.uuid4())
                    filename_escaped = h["filename"].replace("'", "''")
                    payload_json = json.dumps({
                        "trigger_type": "candidate_extracted",
                        "source_artifact_type": "harvest",
                        "source_artifact_id": h["id"],
                        "details": {
                            "candidate_count": created,
                            "filename": h["filename"],
                        }
                    }).replace("'", "''")
                    rc_transition, _ = psql(
                        f"SELECT kernel.sys_transition("
                        f"  'observation.captured'::kernel.event_type,"
                        f"  'observation',"
                        f"  '{obs_id}',"
                        f"  'rover',"
                        f"  '{payload_json}'::jsonb,"
                        f"  p_authority := 'rover'"
                        f");"
                    )
                    if rc_transition == 0:
                        log.info("  ✓ Emitted observation.captured (%s)", obs_id[:8])
                    else:
                        log.warning("  ⚠ Failed to emit observation.captured")
                except Exception as e:
                    log.warning("  ⚠ observation.captured emission failed: %s", e)

            # Publish to Assembly forum if candidates were created (direct path)
            if created > 0 and args.publish:
                log.info("  Publishing harvest %s to Assembly forum...", h["id"][:8])
                if publish_harvest_to_forum(h["id"]):
                    log.info("  ✓ Published to Assembly forum")
                else:
                    log.warning("  ⚠ Failed to publish harvest %s to forum", h["id"][:8])
    
    log.info("=" * 60)
    log.info("COMPLETE: %d candidates created across %d harvests",
             total_candidates, sum(1 for v in results.values() if v[0] > 0))
    log.info("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
