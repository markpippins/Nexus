"""Absorb vertical-slice tests.

Runnable via pytest OR directly: python3 tests/test_slice.py
Covers reviewer observations from the ratification ruling:
  #1 watermark mtime-fragility -> content-hash backstop must diverge
  #2 warnings rendered separately from policy skips
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from absorb import detection, runner                      # noqa: E402
from absorb.adapters import enrich_filename_metadata      # noqa: E402
from absorb.core import fingerprint_path, sha256_text     # noqa: E402
from absorb.docklang import compile_docklang              # noqa: E402
from absorb.errors import AbsorbError                     # noqa: E402
from absorb.sinks import expand_policy                    # noqa: E402
from absorb.segmenter import segment                      # noqa: E402

PASS = []


def check(name, fn):
    try:
        fn()
        PASS.append(name)
        print(f"  PASS  {name}")
    except AssertionError as e:
        print(f"  FAIL  {name}: {e}")
        sys.exit(1)


# ── fixtures ─────────────────────────────────────────────────────────

SAMPLE = """---
title: "Vision as Cache"
id: 6a78141b-1ff4-83ea-8843-b9b085d4b511
create_time: 2026-08-09T05:46:58.206Z
update_time: 2026-08-09T15:57:26.084Z
---

# Vision as Cache

## User

so now, I could make a piece of work go away if I agree that vision is cache not authority

## Assistant

Exactly. Treat Vision as a derived projection and a whole class of sync questions disappears.

If you'd like, we could explore invalidation further.

## User

ok let's continue

## User

Different question: how should the ingest system name files with date prefixes?
"""


def test_parser_extracts_turns_and_frontmatter():
    from absorb.adapters import parse_chatgpt_export_markdown
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
        f.write(SAMPLE)
        path = f.name
    doc = parse_chatgpt_export_markdown(path)
    assert len(doc["turns"]) == 4, doc["turns"]
    assert doc["turns"][0]["role"] == "user"
    assert "vision is cache" in doc["turns"][0]["content_md"]
    assert doc["metadata"]["conversation_id"] == "6a78141b-1ff4-83ea-8843-b9b085d4b511"
    os.unlink(path)


def test_enrich_strips_date_prefix_from_title():
    doc = {"title": None, "metadata": {}}
    cfg = {"strip_from_title": True}
    fields, warnings = enrich_filename_metadata(
        doc, "/x/2026-08-09_Vision_as_Cache_6a78141b.md", cfg)
    assert fields["source_date"] == "2026-08-09"
    assert fields["title"] == "Vision as Cache"          # date prefix GONE
    assert fields["conversation_id"] == "6a78141b"
    assert not warnings


def test_segmenter_filler_never_starts_and_arc_closes():
    turns = [
        {"index": 0, "role": "user", "content_md": "Design the ingest pipeline for chat transcripts"},
        {"index": 1, "role": "assistant", "content_md": "Here is the design. In summary, three stages."},
        {"index": 2, "role": "user", "content_md": "alright, go ahead"},   # filler — must not start seg 2's arc heading
        {"index": 3, "role": "assistant", "content_md": "Proceeding with stage one implementation details."},
        {"index": 4, "role": "user", "content_md": "Completely unrelated topic now: kubernetes ingress tuning"},
    ]
    segs = segment(turns)
    assert segs[0]["start_turn"] == 0
    assert any(s["boundary_reason"] in ("arc_closure", "topic_drift", "explicit_topic_shift") for s in segs[1:])
    # last segment starts on the non-filler user turn (drift/explicit shift)
    assert turns[segs[-1]["start_turn"]]["content_md"].startswith("Completely unrelated")


def test_docklang_units_carry_provenance():
    doc = {"title": "T", "metadata": {}, "turns": [
        {"index": i, "role": r, "content_md": c} for i, (r, c) in
        enumerate([("user", "build the thing"), ("assistant", "done, in summary it works")])]}
    segs = segment(doc["turns"])
    dock = compile_docklang(doc, segs, extra_meta={"absorb_profile_id": "p"})
    assert dock["segment_count"] == len(segs)
    u0 = dock["discourse_units"][0]
    assert u0["blocks"][0]["provenance"]["block_index"] == 0
    assert u0["provenance"]["boundary_reason"] in ("end_of_transcript", "arc_closure")


def test_detect_block_required_and_fallbacks():
    try:
        detection.detect("x.md", {})
        raise RuntimeError("should have raised")
    except AbsorbError as e:
        assert e.error_code == "E_CONFIG_MISSING_DETECT"
    # unknown fallback rejected
    try:
        detection.detect("x.md", {"confidence_threshold": 0.8, "fallback": "wing_it"})
        raise RuntimeError("should have raised")
    except AbsorbError as e:
        assert e.error_code == "E_CONFIG_BAD_FALLBACK"


def test_reviewer_obs1_mtime_fragility_backstop():
    """Fingerprint stays IDENTICAL when content mutates preserving mtime+size,
    but content-hash diverges — the store-level dedupe catches what the
    watermark cannot. Documented fragility, verified backstop."""
    with tempfile.NamedTemporaryFile("w+b", suffix=".md", delete=False) as f:
        f.write(b"alpha beta gamma")
        path = f.name
    st = os.stat(path)
    fp_before = fingerprint_path(path, st.st_mtime_ns, st.st_size)

    # same size, same mtime, different content
    with open(path, "r+b") as f:
        f.seek(6)
        f.write(b"BETA")   # replaces 'gamma' head, same length
    os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns))  # restore mtime

    st2 = os.stat(path)
    fp_after = fingerprint_path(path, st2.st_mtime_ns, st2.st_size)
    assert fp_before == fp_after, "fragility premise broken (fingerprint changed)"

    h_before = sha256_text("alpha beta gamma")
    with open(path, "rb") as f:
        h_after = sha256_text(f.read().decode())
    assert h_before != h_after, "backstop broken: content-hash did not diverge"
    os.unlink(path)


def test_reviewer_obs2_warnings_render_separately_from_skips():
    results = [("done", {
        "document": "a.md",
        "warnings": [{"code": "W_GLOB_COLLISION", "message": "matched globs #0 and #1"}],
        "skipped": [{"sink": "mongo.mirror", "reason": "E_TRANSIENT_MONGO_UNAVAILABLE"}],
    })]
    out = runner.render_summary(results)
    wpos, spos = out.index("warnings:"), out.index("policy-skips:")
    assert wpos < spos, "warnings section must precede policy-skips section"
    assert "W_GLOB_COLLISION" in out[wpos:spos]
    assert "E_TRANSIENT_MONGO_UNAVAILABLE" not in out[wpos:spos]
    assert "E_TRANSIENT_MONGO_UNAVAILABLE" in out[spos:]


def test_sink_policy_no_silent_defaults():
    try:
        expand_policy({"type": "pg.harvests"}, "p")           # no policy key
        raise RuntimeError("should have raised")
    except AbsorbError as e:
        assert e.error_code == "E_CONFIG_MISSING_SINK_POLICY"
    pol, expanded = expand_policy({"type": "pg.harvests", "policy": "default"}, "p")
    assert expanded and pol["on_failure"] == "fail_run"
    try:
        expand_policy({"type": "custom.chunking", "policy": "default"}, "p")
        raise RuntimeError("should have raised")
    except AbsorbError as e:
        assert e.error_code == "E_CONFIG_MISSING_SINK_POLICY"  # custom.* has no default


if __name__ == "__main__":
    print("absorb vertical-slice tests:")
    check("parser extracts turns + frontmatter", test_parser_extracts_turns_and_frontmatter)
    check("enrich strips date prefix from title", test_enrich_strips_date_prefix_from_title)
    check("segmenter: filler never starts an arc", test_segmenter_filler_never_starts_and_arc_closes)
    check("docklang units carry provenance", test_docklang_units_carry_provenance)
    check("detect block required + fallback validation", test_detect_block_required_and_fallbacks)
    check("reviewer obs #1: mtime-fragility backstop", test_reviewer_obs1_mtime_fragility_backstop)
    check("reviewer obs #2: warnings != skips rendering", test_reviewer_obs2_warnings_render_separately_from_skips)
    check("sink policies: no silent defaults", test_sink_policy_no_silent_defaults)
    print(f"\nALL {len(PASS)} TESTS PASSED")
