"""Runner: step orchestration with run/run_step recording (spec C1–C4).

Step order per profile: discover -> detect -> parse -> enrich -> segment ->
compile-docklang -> sinks[*]. Each step is recorded in absorb.run_steps with
the C1 error taxonomy; sink steps additionally record policy outcomes.
"""

from __future__ import annotations

import json
import re
import uuid
from pathlib import Path

from . import detection, discovery, sinks
from .adapters import enrich_filename_metadata, get_adapter
from .core import (pg_execute, pg_fetchall, pg, fingerprint_path,
                   sha256_text, source_rel_path)
from .docklang import compile_docklang
from .errors import AbsorbError
from .events import (emit_source_completed, emit_step_failed)
from .segmenter import segment

STEP_ORDER = ["discover", "detect", "parse", "enrich", "segment", "compile-docklang", "sinks"]

# Current invocation context for event emission (plan 0003): set once by the
# CLI per batch; per-document events carry it as correlation_id.
BATCH: dict = {}


# ── Profile load / registration ──────────────────────────────────────

def load_profile(profile_ref: str) -> dict:
    """profile_ref = name; YAML located in profiles/ next to the package."""
    import yaml
    path = Path(__file__).parent / "profiles" / f"{profile_ref}.yaml"
    if not path.exists():
        raise AbsorbError("E_CONFIG_PROFILE_NOT_FOUND", str(path))
    prof = yaml.safe_load(path.read_text())
    prof["_path"] = str(path)
    if not prof.get("detect"):
        raise AbsorbError("E_CONFIG_MISSING_DETECT", profile_ref)
    # Validate + expand sink policies now (fail fast, log expansions).
    expanded = []
    for i, s in enumerate(prof.get("sinks") or []):
        pol, was_default = sinks.expand_policy(s, prof["id"])
        s = dict(s)
        s["_resolved_policy"] = pol
        s["_policy_expanded_from_default"] = was_default
        expanded.append(s)
    prof["sinks"] = expanded
    return prof


def register_profile(prof: dict) -> None:
    """Mirror the active YAML into absorb.profiles + append-only history."""
    yaml_text = Path(prof["_path"]).read_text()
    pg_execute(
        """INSERT INTO absorb.profile_versions (profile_id, version, yaml_content, activated_by)
           VALUES (%s,%s,%s,'absorb-register') ON CONFLICT (profile_id, version) DO NOTHING""",
        (prof["id"], prof.get("version", 1), yaml_text),
    )
    pg_execute(
        """INSERT INTO absorb.profiles (id, version, schema_version, yaml_content, enabled, description, depends_on)
           VALUES (%s,%s,%s,%s,true,%s,%s::jsonb)
           ON CONFLICT (id) DO UPDATE SET version=EXCLUDED.version, yaml_content=EXCLUDED.yaml_content,
             enabled=EXCLUDED.enabled, description=EXCLUDED.description, updated_at=now()""",
        (prof["id"], prof.get("version", 1), str(prof.get("schema_version", "1.0")),
         yaml_text, prof.get("description"), json.dumps(prof.get("depends_on") or [])),
    )
    for s in prof["sinks"]:
        if s.get("_policy_expanded_from_default"):
            print(f"[register] sink '{s['type']}': policy:default expanded to "
                  f"{json.dumps(s['_resolved_policy'])}")


# ── Green-field guard (spec C4) ──────────────────────────────────────

def green_field_check(prof: dict, conn=None) -> dict:
    """First-run emptiness assertion scoped by profile identity."""
    pid = prof["id"]
    rows = pg_fetchall(
        """SELECT status, count(*)::int AS n FROM absorb.runs
           WHERE profile_id=%s AND dry_run=false GROUP BY status""", (pid,))
    prior_done = sum(r["n"] for r in rows if r["status"] == "done")
    harvest_rows = pg_fetchall(
        """SELECT count(*)::int AS n FROM nebula.harvests
           WHERE metadata->>'absorb_profile_id'=%s""", (pid,))
    return {
        "first_run": prior_done == 0,
        "existing_harvest_rows": harvest_rows[0]["n"] if harvest_rows else 0,
    }


def enforce_green_field(prof: dict, assume_empty_target: bool) -> list[str]:
    info = green_field_check(prof)
    warnings = []
    if info["first_run"] and info["existing_harvest_rows"] > 0:
        if not assume_empty_target:
            raise AbsorbError(
                "E_CONFIG_TARGET_NOT_EMPTY",
                f"profile '{prof['id']}' first run but {info['existing_harvest_rows']} "
                "harvest row(s) already carry its identity; pass --assume-empty-target "
                "if this is genuinely a fresh target",
            )
        warnings.append("W_GREEN_FIELD_OVERRIDE_USED")
    return warnings


# ── Watermarks (spec C3) ─────────────────────────────────────────────

def watermarks_for(pid: str, ver: int) -> set[str]:
    """Batched lookup — one query per run, not one per file."""
    rows = pg_fetchall(
        "SELECT source_fingerprint FROM absorb.watermarks "
        "WHERE profile_id=%s AND profile_version=%s", (pid, ver))
    return {r["source_fingerprint"] for r in rows}


def watermark_seen(pid: str, ver: int, fp: str) -> bool:
    return fp in watermarks_for(pid, ver)


def watermark_put(pid: str, ver: int, fp: str) -> None:
    pg_execute(
        "INSERT INTO absorb.watermarks (profile_id, profile_version, source_fingerprint) "
        "VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
        (pid, ver, fp))


def clear_watermarks(pid: str) -> int:
    n = pg_fetchall("SELECT count(*)::int AS n FROM absorb.watermarks WHERE profile_id=%s", (pid,))
    pg_execute("DELETE FROM absorb.watermarks WHERE profile_id=%s", (pid,))
    return n[0]["n"] if n else 0


# ── Run recording helpers ────────────────────────────────────────────

def _record_step(run_id: str, idx: int, step_type: str, status: str, *,
                 error: AbsorbError | None = None, skip_reason: str | None = None,
                 attempts: int = 1):
    pg_execute(
        """INSERT INTO absorb.run_steps
           (run_id, step_index, step_type, status, error_code, retryable,
            skip_reason, attempts, completed_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s, now())
           ON CONFLICT (run_id, step_index) DO UPDATE SET status=EXCLUDED.status,
             error_code=EXCLUDED.error_code, retryable=EXCLUDED.retryable,
             skip_reason=EXCLUDED.skip_reason, attempts=EXCLUDED.attempts,
             completed_at=now()""",
        (run_id, idx, step_type, status,
         error.error_code if error else None,
         error.retryable if error else None,
         skip_reason, attempts))


def new_run(pid: str, ver: int, document_id: str | None, dry_run: bool) -> str:
    rid = str(uuid.uuid4())
    pg_execute(
        "INSERT INTO absorb.runs (id, profile_id, profile_ver, document_id, status, dry_run) "
        "VALUES (%s,%s,%s,%s,'running',%s)", (rid, pid, ver, document_id, dry_run))
    for i, st in enumerate(STEP_ORDER):
        pg_execute(
            "INSERT INTO absorb.run_steps (run_id, step_index, step_type) VALUES (%s,%s,%s)",
            (rid, i, st))
    return rid


def finish_run(run_id: str, status: str, summary: dict) -> None:
    pg_execute("UPDATE absorb.runs SET status=%s, summary=%s::jsonb, updated_at=now() WHERE id=%s",
               (status, json.dumps(summary), run_id))


# ── The pipeline for one document ────────────────────────────────────

def process_document(prof: dict, file_info: dict, repo_root: Path, *,
                     dry_run: bool, assume_empty_target: bool,
                     force: bool = False) -> tuple[str, dict]:
    """Run one source file through the full step graph.

    Returns (run_status, summary). Warnings accumulate in
    summary['warnings']; policy skips in summary['skipped'] — rendered
    separately so reporting never conflates them (reviewer obs #2).
    """
    pid = prof["id"]
    ver = int(prof.get("version", 1))
    path = file_info["path"]
    rel = source_rel_path(path, repo_root)

    rid = new_run(pid, ver, None, dry_run)
    warnings: list[dict] = []
    skipped: list[dict] = []
    summary: dict = {"profile": f"{pid}@v{ver}", "document": rel}

    def step(idx: int):
        return STEP_ORDER[idx]

    try:
        # discover-level warnings carried onto every doc run of this batch
        for w in file_info.get("_batch_warnings", []):
            warnings.append({"code": w["code"], "message": w["message"]})

        raw = Path(path).read_text(encoding="utf-8", errors="replace")
        content_hash = sha256_text(raw)

        # detect (required block validated at load; fallback explicit)
        det = detection.detect(path, prof["detect"])
        summary["detection"] = det
        if det["action"] == "skip":
            err = AbsorbError(det["reason"].split(" ", 1)[0], det["reason"])
            _record_step(rid, STEP_ORDER.index("detect"), "detect", "skipped", error=err)
            finish_run(rid, "failed", {**summary, "error": err.error_code})
            return "failed", summary

        # parse
        adapter = get_adapter(det["format"])
        doc = adapter(path)

        # enrich (filename metadata as data; date prefixes stripped from titles)
        fields, w = enrich_filename_metadata(doc, path,
                                             (prof.get("enrich") or {}).get("filename_metadata"))
        warnings += [{"code": x.split(":", 1)[0], "message": x} for x in w]
        if fields.get("title"):
            doc["title"] = fields.pop("title")
        if fields.get("source_date"):
            doc["metadata"]["source_date"] = fields.pop("source_date")
        if fields.get("conversation_id"):
            doc["metadata"]["conversation_id"] = fields.pop("conversation_id")

        # segment (C6 metric; default reported in summary)
        seg_cfg = (prof.get("segment") or {})
        opts = seg_cfg.get("options") or {}
        drift_threshold = float(opts.get("drift_threshold", 0.08))
        segs = segment(doc["turns"], drift_threshold=drift_threshold)

        # compile-docklang
        meta = {"absorb_profile_id": pid, "absorb_profile_version": ver,
                "conversation_id": doc["metadata"].get("conversation_id"),
                "source_date": doc["metadata"].get("source_date"),
                "content_hash": content_hash}
        dock = compile_docklang(doc, segs, extra_meta=meta)

        # persist absorb-native state (documents/turns/segments) unless dry-run
        document_id = None
        if not dry_run:
            existing = pg_fetchall(
                "SELECT id FROM absorb.documents WHERE profile_id=%s AND content_hash=%s",
                (pid, content_hash))
            if existing:
                document_id = existing[0]["id"]
            else:
                document_id = str(uuid.uuid4())
                pg_execute(
                    """INSERT INTO absorb.documents
                       (id, profile_id, profile_version, source_path, content_hash,
                        conversation_id, title, metadata, source_date)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s)""",
                    (document_id, pid, ver, rel, content_hash,
                     doc["metadata"].get("conversation_id"), doc["title"],
                     json.dumps(doc["metadata"]),
                     doc["metadata"].get("source_date")))
                for t in doc["turns"]:
                    pg_execute(
                        "INSERT INTO absorb.turns (document_id, turn_index, role, content_md, ts) "
                        "VALUES (%s,%s,%s,%s,%s)",
                        (document_id, t["index"], t["role"], t["content_md"],
                         t.get("ts") or doc["metadata"].get("created_at")))
                for sg in segs:
                    pg_execute(
                        """INSERT INTO absorb.segments
                           (document_id, seg_index, start_turn, end_turn, arc_type,
                            boundary_reason, heading)
                           VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                        (document_id, sg["segment_index"], sg["start_turn"], sg["end_turn"],
                         "discourse-arc", sg["boundary_reason"], sg["heading"]))
        pg_execute(
            "UPDATE absorb.runs SET document_id=%s WHERE id=%s", (document_id, rid))
        summary.update({"turns": len(doc["turns"]), "segments": len(segs),
                        "drift_threshold": drift_threshold})

        # sinks (each with explicit policy; canonical fail_run / optional skip_sink)
        existing_harvest = None
        if document_id:
            rows_a = pg_fetchall(
                "SELECT ref->>'harvest_id' AS hid FROM absorb.artifacts "
                "WHERE document_id=%s AND artifact_type='pg.harvests' LIMIT 1",
                (document_id,))
            existing_harvest = rows_a[0]["hid"] if rows_a else None

        ctx = {"docklang": dock, "title": doc["title"], "source_rel_path": rel,
               "existing_harvest_id": existing_harvest,
               "source_text": raw, "profile_id": pid, "profile_version": ver,
               "conversation_id": doc["metadata"].get("conversation_id"),
               "source_date": doc["metadata"].get("source_date"),
               "content_hash": content_hash, "turns": doc["turns"]}
        artifacts = []
        for s in prof["sinks"]:
            if dry_run:
                skipped.append({"sink": s["type"], "reason": "DRY_RUN"})
                continue
            res = sinks.deliver(s["type"], {k: v for k, v in s.items() if not k.startswith("_")},
                                s["_resolved_policy"], ctx)
            if res["status"] == "delivered":
                artifacts.append({"type": s["type"], "ref": res["ref"]})
                if document_id:
                    pg_execute(
                        """INSERT INTO absorb.artifacts
                           (producer_profile, profile_version, document_id, artifact_type, ref)
                           VALUES (%s,%s,%s,%s,%s::jsonb)""",
                        (pid, ver, document_id, s["type"], json.dumps(res["ref"])))
            else:
                skipped.append({"sink": s["type"], "reason": res["skip_reason"],
                                "detail": res.get("skip_detail", "")})

        # watermark only on full success (same identity as the CLI filter)
        if not dry_run and any(a["type"] == "pg.harvests" for a in artifacts):
            wm = fingerprint_path(rel, Path(path).stat().st_mtime_ns,
                                  Path(path).stat().st_size)
            watermark_put(pid, ver, wm)
            if BATCH:
                emit_source_completed(BATCH.get("id", ""), rid, content_hash, wm,
                                      causation_id=BATCH.get("started_event_id"))

        for i, st in enumerate(STEP_ORDER):
            _record_step(rid, i, st, "done")
        finish_run(rid, "done", {**summary, "warnings": warnings, "skipped": skipped})
        summary.update({"warnings": warnings, "skipped": skipped, "run_id": rid})
        return "done", summary

    except AbsorbError as err:
        cls_idx = STEP_ORDER.index(next((s for s in ("discover", "detect", "parse", "enrich",
                                                     "segment", "compile-docklang", "sinks")
                                         if err.message.find(s) >= 0), "sinks"))
        _record_step(rid, cls_idx, STEP_ORDER[cls_idx], "failed", error=err)
        if BATCH:
            emit_step_failed(BATCH.get("id", ""), rid,
                             STEP_ORDER[cls_idx], err.error_code, err.retryable)
        finish_run(rid, "failed", {**summary, "warnings": warnings, "skipped": skipped,
                                   "error": err.error_code, "error_message": err.message})
        summary.update({"error": err.error_code, "error_message": err.message,
                        "warnings": warnings, "skipped": skipped, "run_id": rid})
        return "failed", summary


# ── Run summaries (reviewer obs #2: warnings ≠ skips) ────────────────

def render_summary(results: list[tuple[str, dict]]) -> str:
    done = [r for s, r in results if s == "done"]
    failed = [(s, r) for s, r in results if s != "done"]
    lines = [f"runs: {len(results)} | done: {len(done)} | failed: {len(failed)}"]

    warn_lines = []
    for _, r in results:
        for w in r.get("warnings", []):
            warn_lines.append(f"  WARN  {w['code']}: {w['message']}")
    if warn_lines:
        lines.append("warnings:")   # distinct section — never mixed with skips
        lines.extend(warn_lines)

    skip_lines = []
    for _, r in results:
        for sk in r.get("skipped", []):
            sink = sk.get("sink", "step")
            reason = sk.get("reason", "")
            detail = sk.get("detail", "") or sk.get("message", "")
            skip_lines.append(f"  SKIP  [{sink}] {reason}" + (f" — {detail[:120]}" if detail else ""))
    if skip_lines:
        lines.append("policy-skips:")
        lines.extend(skip_lines)

    for s, r in failed:
        lines.append(f"FAILED: {r.get('document', '?')} — {r.get('error')}: "
                     f"{(r.get('error_message') or '')[:160]}")
    return "\n".join(lines)


def reprocess(profile_ref: str) -> int:
    prof = load_profile(profile_ref)
    n = clear_watermarks(prof["id"])
    print(f"cleared {n} watermark(s) for {prof['id']}@v{prof.get('version', 1)} "
          "(store dedupe via content-hash remains in force)")
    return n
