#!/usr/bin/env python3
"""
Batch File Candidates — Stage 2 Inference

Reads docklang from nebula.harvests, uses Gemini to identify candidate-worthy
architectural concepts, maps them to the Nebula hierarchy (systems/subsystems/
features), and creates harvest candidates via the nebula-srv REST API.

Usage:
    cd /home/codex/dev/nexus/python/rover
    source .venv/bin/activate
    python3 batch_file_candidates.py [--dry-run] [--limit N] [--batch N]
"""

import argparse
import json
import logging
import subprocess
import sys
import time
from pathlib import Path

log = logging.getLogger("batch_file_candidates")

PROJECT_ROOT = Path("/home/codex/dev")
DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]
NEBULA_API = "http://localhost:3101/api"
GEMINI_API_KEY = "AIzaSyD0sfwbXYGGyaa8gCkVziqYzoVbmxbuJqQ"
GEMINI_MODEL = "gemini-2.5-flash"

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


def call_gemini(prompt: str) -> str | None:
    import urllib.request, urllib.error
    import time
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 8192}
    }
    data = json.dumps(payload).encode("utf-8")
    
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                resp = json.loads(r.read().decode())
            candidates = resp.get("candidates", [])
            if not candidates:
                return None
            return candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        except urllib.error.HTTPError as e:
            body = e.read().decode() if e.fp else "(no body)"
            if e.code == 503 and attempt < max_retries:
                wait = attempt * 15
                log.warning("  503 error (attempt %d/%d), waiting %ds...", attempt, max_retries, wait)
                time.sleep(wait)
                continue
            log.error("  Gemini API error %s: %s", e.code, body[:300])
            return None
        except Exception as e:
            log.error("  Gemini call failed: %s", e)
            return None
    return None


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


def get_unfiled_harvests(limit: int = None) -> list[dict]:
    try:
        candidates_data = nebula_get("/harvest-candidates?limit=500")
        candidates = candidates_data.get("candidates", [])
        filed_harvest_ids = set(c.get("harvest_id") for c in candidates if c.get("harvest_id"))
        log.info("Existing: %d candidates across %d harvests", len(candidates), len(filed_harvest_ids))
    except Exception as e:
        log.warning("Could not fetch existing candidates: %s", e)
        filed_harvest_ids = set()
    
    rc, out = psql("SELECT id, source_filename FROM nebula.harvests WHERE docklang IS NOT NULL ORDER BY created_at DESC;")
    if rc != 0 or not out:
        log.error("Failed to query harvests")
        return []
    
    harvests = []
    for line in out.splitlines():
        parts = line.split("|", 1)
        if len(parts) == 2:
            hid, fname = parts
            if hid not in filed_harvest_ids:
                harvests.append({"id": hid, "filename": fname})
    
    log.info("Unfiled: %d / %d harvests", len(harvests), len(out.splitlines()))
    if limit:
        harvests = harvests[:limit]
    return harvests


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


def create_candidate(harvest_id: str, candidate: dict) -> bool:
    body = {"harvestId": harvest_id, **candidate}
    for k in ["systemMatch", "subsystemMatch", "featureMatch"]:
        body.pop(k, None)
    result = nebula_post("/harvest-candidates", body)
    if isinstance(result, dict) and result.get("error"):
        return False
    return True


def main():
    parser = argparse.ArgumentParser(description="Batch file candidates")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--batch", type=int, default=3)
    parser.add_argument("--resume", type=str, default=None)
    args = parser.parse_args()
    
    log.info("=" * 60)
    log.info("Batch File Candidates — Stage 2 Inference")
    log.info("Model: %s | Batch: %d", GEMINI_MODEL, args.batch)
    
    systems = fetch_hierarchy()
    if not systems:
        return 1
    hierarchy_text = build_hierarchy_text(systems)
    
    harvests = get_unfiled_harvests(args.limit)
    if not harvests:
        log.info("No unfiled harvests.")
        return 0
    
    if args.resume:
        try:
            idx = next(i for i, h in enumerate(harvests) if h["id"] == args.resume)
            harvests = harvests[idx:]
        except StopIteration:
            pass
    
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
        response = call_gemini(prompt)
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
        
        log.info("  Gemini: %d candidates in %.1fs", len(candidates), elapsed)
        
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
                if create_candidate(h["id"], c):
                    created += 1
                    total_candidates += 1
            results[h["id"]] = (created, elapsed)
    
    log.info("=" * 60)
    log.info("COMPLETE: %d candidates created across %d harvests",
             total_candidates, sum(1 for v in results.values() if v[0] > 0))
    log.info("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
