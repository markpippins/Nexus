"""Run span distribution logging across all transcript HTML files.

For each transcript, converts via DocLing, parses through the pipeline,
then runs _segment_text() with SpanDistribution stats on each message.
"""

import sys
from pathlib import Path

from models import SpanDistribution
from base_parser import BaseParser, detect_and_parse

# Import parsers to populate the registry (decorators register them)
import parsers.chatgpt_parser    # noqa: F401
import parsers.copilot_parser    # noqa: F401
import parsers.opencode_parser   # noqa: F401
import parsers.gemini_parser     # noqa: F401
import parsers.markdown_parser   # noqa: F401


def extract_message_texts_from_parsed(messages) -> list[dict]:
    """Extract raw text dicts from parsed NormalizedMessage objects.

    Returns list of dicts with {message_id, speaker, raw_text}.
    """
    results = []
    for i, msg in enumerate(messages):
        msg_id = getattr(msg, "message_id", f"msg-{i}") or f"msg-{i}"
        speaker = getattr(msg, "speaker", "unknown") or "unknown"
        raw_text = getattr(msg, "text", "") or ""
        if raw_text.strip():
            results.append({
                "message_id": msg_id,
                "speaker": speaker,
                "raw_text": raw_text,
            })
    return results


def main():
    transcripts_dir = Path(__file__).parent / "transcripts"
    html_files = sorted(transcripts_dir.glob("*.html"))

    all_stats: list[SpanDistribution] = []
    parser_usage: dict[str, int] = {}
    errors: list[str] = []

    print(f"[span-logging] Processing {len(html_files)} transcript files...\n", flush=True)

    # Instantiate DoclingAdapter once
    try:
        from docling_adapter import DoclingAdapter
        adapter = DoclingAdapter(enable_ocr=False)
    except ImportError as e:
        print(f"[span-logging] ERROR: {e}", file=sys.stderr)
        print("[span-logging] Docling is required but not installed.", file=sys.stderr)
        print("[span-logging] Install it with: pip install docling", file=sys.stderr)
        sys.exit(1)

    for fpath in html_files:
        # Convert via DocLing
        try:
            result = adapter.convert(fpath)
        except Exception as e:
            errors.append(f"{fpath.name}: DocLing convert error: {e}")
            continue

        # Parse through the pipeline
        try:
            messages, meta = detect_and_parse(result.document, fpath)
        except Exception as e:
            errors.append(f"{fpath.name}: detect_and_parse error: {e}")
            continue

        source_name = meta.export_source if hasattr(meta, "export_source") and meta.export_source else "unknown"
        parser_usage[source_name] = parser_usage.get(source_name, 0) + 1

        messages_texts = extract_message_texts_from_parsed(messages)

        pv = f"{source_name.lower()}_v1"

        for msg in messages_texts:
            spans = BaseParser._segment_text(msg["raw_text"], msg["message_id"], pv)
            para_count = sum(1 for p in __import__("re").split(r"\n{2,}", msg["raw_text"]) if p.strip())
            stats = BaseParser._compute_span_stats(spans, msg["message_id"], pv, para_count)
            all_stats.append(stats)

            # Per-message verbose output
            print(stats.summary(), flush=True)

    # ── Aggregate summary ──────────────────────────────────────────────────
    print(f"\n{'='*80}")
    print(f"[span-logging] AGGREGATE SUMMARY")
    print(f"{'='*80}")
    print(f"  Files processed: {len(html_files)}")
    print(f"  Errors: {len(errors)}")
    for e in errors[:5]:
        print(f"    - {e}")
    print(f"  Parser usage: {parser_usage}")
    print(f"  Total messages: {len(all_stats)}")
    print(f"  Total spans: {sum(s.total_spans for s in all_stats)}")

    if not all_stats:
        print("  No stats to aggregate.")
        return

    # Aggregate by span type
    total_struct = sum(s.structural_count for s in all_stats)
    total_disc = sum(s.discourse_count for s in all_stats)
    total_event = sum(s.event_count for s in all_stats)
    total_noise = sum(s.noise_count for s in all_stats)
    total_spans = sum(s.total_spans for s in all_stats)

    print(f"\n  Span type distribution:")
    print(f"    STRUCTURAL:      {total_struct:>6d}  ({total_struct/total_spans*100:5.1f}%)")
    print(f"    DISCOURSE:       {total_disc:>6d}  ({total_disc/total_spans*100:5.1f}%)")
    print(f"    EVENT_CANDIDATE: {total_event:>6d}  ({total_event/total_spans*100:5.1f}%)")
    print(f"    NOISE:           {total_noise:>6d}  ({total_noise/total_spans*100:5.1f}%)")

    # D/E ratio
    de_ratio = total_disc / total_event if total_event > 0 else float("inf")
    print(f"\n  DISCOURSE/EVENT ratio: {de_ratio:.1f}")
    if de_ratio > 3.0:
        print(f"    ⚠ Classifier heavily biased toward DISCOURSE (events under-classified)")

    # Confidence
    mean_conf = sum(s.mean_confidence for s in all_stats) / len(all_stats)
    print(f"  Mean confidence: {mean_conf:.3f}")

    # Span-to-paragraph ratio
    total_paras = sum(s.paragraph_count for s in all_stats)
    span_para_ratio = total_spans / total_paras if total_paras > 0 else 0
    print(f"  Span/paragraph ratio: {span_para_ratio:.2f}")
    if span_para_ratio < 1.2:
        print(f"    ⚠ Coarse segmentation (risk of intra-paragraph type mixing)")

    # Discourse role breakdown
    all_disc_roles: dict[str, int] = {}
    all_mk_roles: dict[str, int] = {}
    for s in all_stats:
        for role, count in s.discourse_roles.items():
            all_disc_roles[role] = all_disc_roles.get(role, 0) + count
        for role, count in s.markdown_roles.items():
            all_mk_roles[role] = all_mk_roles.get(role, 0) + count

    if all_disc_roles:
        print(f"\n  Discourse role breakdown:")
        for role, count in sorted(all_disc_roles.items(), key=lambda x: -x[1]):
            print(f"    {role}: {count}")

    if all_mk_roles:
        print(f"\n  Markdown role breakdown:")
        for role, count in sorted(all_mk_roles.items(), key=lambda x: -x[1]):
            print(f"    {role}: {count}")

    # Messages with zero events
    zero_event_msgs = [s for s in all_stats if s.event_count == 0 and s.total_spans > 0]
    print(f"\n  Messages with ZERO event spans: {len(zero_event_msgs)}/{len(all_stats)} "
          f"({len(zero_event_msgs)/len(all_stats)*100:.1f}%)")

    print(f"\n{'='*80}")
    print("[span-logging] DONE")


if __name__ == "__main__":
    main()
