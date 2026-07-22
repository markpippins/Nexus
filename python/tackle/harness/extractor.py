"""extractor.py — Adverb-stripping extractor harness.

Reads raw "brain" transcript files and produces a cleaned copy for
each. Two paths per file, decided by a cheap deterministic
pre-check (no LLM needed):

  * NEEDS CLEANING  — the file contains a run of 3+ words
    ending in "-ly" (the Gemini fluff signature). The text is
    sent to the LLM with a strict "copy minus adverbs" prompt;
    the model's output becomes the cleaned copy.

  * CLEAN ALREADY   — no 3+ "-ly" run. The file is copied
    verbatim to the target folder (no LLM call, no tokens).

Unlike the architect harness, output is prose (a cleaned copy),
not a structured bullet list. Structure, headings, code, names,
numbers, and punctuation are all preserved — only adverbs go.

Model resolution: tackle-mcp role configs use a fixed enum and
"extractor" is not a registered role, so the harness resolves
its model via the "Rover" config (openai primary + fallback).
The role label only drives model resolution, not the prompt/behavior.

Batching: process files in batches of BATCH_SIZE (default 5).
Intended to be driven by a cron job that copies a few files
from HOLD → IN, then runs this harness; existing cleaned
outputs in OUT are skipped.

Usage:
    from tackle.harness import ExtractorHarness
    import psycopg2

    conn = psycopg2.connect("postgresql://pguser:pgpass@localhost:5432/nexus")
    harness = ExtractorHarness(conn)
    result = harness.run_cycle(batch_size=5, dry_run=False)
"""

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg2

from .base import Harness

log = logging.getLogger("extractor")

# ── Folders (fill these in) ───────────────────────────────────
SOURCE_DIR = Path("/home/codex/dev/nexus/python/tackle/harness/IN")     # raw inputs
TARGET_DIR = Path("/home/codex/dev/nexus/python/tackle/harness/OUT")   # cleaned copies

# ── Tuning ───────────────────────────────────────────────────
BATCH_SIZE = 5
# A run of N+ consecutive words ending in "-ly" marks a fluffy file.
ADVERB_RUN_THRESHOLD = 3
# Resolve model via this registered tackle-mcp role (extractor is not
# in the role-config enum, so we borrow Rover's model+fallback).
RESOLVE_ROLE = "Rover"

# Accepted transcript suffixes. Reconciliation "brain" outputs use a
# compound suffix like ".md.resolved.31" — we accept any file whose
# leading doc-type is .md / .txt / .html, allowing ".md.<tag>.<n>".
_ACCEPTED_DOC_TYPES = (".md", ".txt", ".html")

# ── System Prompt ───────────────────────────────────────────────
EXTRACTOR_SYSTEM_PROMPT = """You are a lossy text filter. You receive a document and emit the SAME document with every adverb deleted.

WHAT TO DO
- Copy the input text. Delete every word ending in "-ly" (adverbs such as
  cleanly, seamlessly, elegantly, intuitively, cleverly, dependably,
  optimally, effectively, solidly, comfortably, naturally, efficiently,
  implicitly, intelligently, explicitly, fluently, gracefully, reliably,
  correctly, neatly, securely, beautifully, predictably, robustly,
  sensibly, squarely, firmly, nicely, flexibly, compactly, brilliantly,
  stably, dynamically, organically, functionally, flawlessly, smartly,
  fluidly, natively, properly, rationally, tightly, effortlessly,
  structurally, perfectly, confidently, successfully, completely,
  automatically). Delete it AND any comma/space immediately after it.
- Keep EVERYTHING else byte-for-byte: headings, numbers, code, names,
  punctuation, line breaks, blank lines.

HARD CONSTRAINTS (violation = failure)
- DO NOT explain. DO NOT narrate. DO NOT say "here is" or "I will".
- DO NOT add, rewrite, reorder, summarize, condense, or shorten anything.
- PRESERVE the full document. Every paragraph, sentence, line, and word
  from the input MUST appear in your output, in the SAME order. The ONLY
  permitted difference is that adverb words are removed. If your output is
  materially shorter than the input (minus the deleted adverbs), you FAILED.
- Your entire response must be the filtered document and nothing else.
- If the input is the only thing in your response, you succeeded."""


# ── Suffix / file-type helpers ────────────────────────────────

def _doc_type_is_accepted(p: Path) -> bool:
    """Accept .md/.txt/.html, including .md.resolved.31 forms."""
    if not p.is_file():
        return False
    name = p.name
    if "." not in name:
        return False
    # strip leading doc-type: "x.md.resolved.31" -> "md"
    first_ext = "." + name.split(".", 1)[1].split(".", 1)[0].lower()
    return first_ext in _ACCEPTED_DOC_TYPES


def _is_metadata(p: Path) -> bool:
    return p.name.endswith(".metadata.json")


def discover_source_files(source_dir: Path, limit: int | None = None) -> list[Path]:
    """List unprocessed raw transcript files in the source folder."""
    if not source_dir.exists():
        log.error("Source dir missing: %s", source_dir)
        return []
    files = sorted(
        [p for p in source_dir.iterdir()
         if _doc_type_is_accepted(p) or _is_metadata(p)],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if limit:
        files = files[:limit]
    log.info("Discovered %d source file(s) in %s", len(files), source_dir)
    return files


def target_path_for(source: Path, target_dir: Path) -> Path:
    """Map a source file to its cleaned output path.

    <stem>.md.resolved.31  ->  <stem>.md.resolved-clean.31
    <stem>.md               ->  <stem>-clean.md
    <stem>.metadata.json    ->  <stem>.metadata-clean.json
    """
    name = source.name
    if ".resolved." in name:
        base, _, num = name.partition(".resolved.")
        return target_dir / f"{base}.resolved-clean.{num}"
    if name.endswith(".metadata.json"):
        return target_dir / name.replace(".metadata.json", "-clean.metadata.json")
    if name.endswith(".md"):
        return target_dir / name.replace(".md", "-clean.md")
    return target_dir / f"{source.stem}-clean{source.suffix}"


def already_processed(source: Path, target_dir: Path) -> bool:
    return target_path_for(source, target_dir).exists()


def needs_cleaning(text: str, threshold: int = ADVERB_RUN_THRESHOLD) -> bool:
    """Deterministic pre-check: does the text contain a run of
    `threshold`+ words ending in '-ly' (separated by space/comma)?
    """
    pat = re.compile(r"(\w+ly[ ,]+){%d}" % threshold)
    return bool(pat.search(text.lower()))


# ── Deterministic regex cleaner ──────────────────────────────
_ADVERB_RE = re.compile(r"\w+ly\b[ ,]*")
_ONLY_PUNCT_RE = re.compile(r"^[!.,;:\s]+$")


def clean_adverbs_regex(text: str) -> str:
    """Deterministically strip adverbs and tidy the result.

    Removes every '-ly' word plus any trailing comma/space, drops
    lines that became empty or punctuation-only, and trims dangling
    '!'/'.' artifacts left by adverb-salad lines. Deterministic and
    fast — used as the primary cleaner (the LLM is only a fallback).
    """
    out = _ADVERB_RE.sub("", text)
    lines = []
    for ln in out.split("\n"):
        s = ln.strip()
        if s == "" or _ONLY_PUNCT_RE.fullmatch(s):
            continue
        # drop a lone '!' or '.' left hanging at end of a now-meaningless line
        s = re.sub(r"\s*[.!]\s*$", "", s) if s in ("!", ".") else s
        lines.append(ln.rstrip())
    return "\n".join(lines)


def ensure_target_dir(target_dir: Path) -> bool:
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        return True
    except Exception as e:
        log.error("Cannot create target dir %s: %s", target_dir, e)
        return False


# ── Extractor Harness ────────────────────────────────────────

class ExtractorHarness(Harness):
    """Adverb-stripping harness: raw text in, cleaned copy out.

    The harness:
    1. Discovers raw transcript files in SOURCE_DIR (deterministic)
    2. For each, runs a deterministic adverb-run pre-check
    3. If fluffy  -> invokes LLM (copy minus adverbs)
       If clean  -> copies verbatim (no LLM)
    4. Writes the result to TARGET_DIR
    """

    def __init__(self, conn: psycopg2.extensions.connection | None = None,
                 dsn: str = "postgresql://pguser:pgpass@localhost:5432/nexus"):
        super().__init__(role=RESOLVE_ROLE)
        self._conn = conn
        self._dsn = dsn
        self.source_dir = SOURCE_DIR
        self.target_dir = TARGET_DIR

    def _ensure_connection(self):
        """Reconnect if the connection was closed during an LLM call."""
        if self._conn is None:
            return
        try:
            if self._conn.closed:
                raise psycopg2.OperationalError("connection closed")
            cur = self._conn.cursor()
            cur.execute("SELECT 1")
            cur.close()
        except Exception:
            log.info("Reconnecting to database...")
            self._conn = psycopg2.connect(self._dsn)

    def build_prompt(self, context: dict) -> str:
        """Wrap the source text for the extractor LLM."""
        text = context.get("text", "")
        filename = context.get("filename", "unknown")
        return (
            f"# File: {filename}\n\n"
            f"Produce the adverb-stripped copy of the following text:\n\n"
            f"{text}"
        )

    def handle_response(self, response: str, context: dict) -> dict:
        """Write the cleaned copy to the target folder.

        Returns a result dict with the output path and char counts.
        """
        source_name = context.get("filename", "unknown")
        cleaned = self._normalize(response)

        out_path = target_path_for(
            Path(context.get("source_path", source_name)),
            self.target_dir,
        )

        if not ensure_target_dir(self.target_dir):
            return {"success": False, "error": "target dir unavailable", "written": False}

        try:
            out_path.write_text(cleaned, encoding="utf-8")
            log.info("Wrote cleaned copy: %s (%d chars)", out_path.name, len(cleaned))
            return {
                "success": True,
                "written": True,
                "output_path": str(out_path),
                "source_chars": len(context.get("text", "")),
                "cleaned_chars": len(cleaned),
                "mode": context.get("mode", "llm"),
            }
        except Exception as e:
            log.error("Failed to write %s: %s", out_path, e)
            return {"success": False, "error": str(e), "written": False}

    def _normalize(self, response: str) -> str:
        """Strip stray wrapping fences the model may add despite instructions."""
        text = response.strip()
        fence = re.match(r"^```[a-zA-Z]*\s*\n(.*)\n```$", text, re.DOTALL)
        if fence:
            text = fence.group(1).strip()
        return text

    def _copy_verbatim(self, source: Path) -> dict:
        """Copy a clean file unchanged (no LLM)."""
        out_path = target_path_for(source, self.target_dir)
        if not ensure_target_dir(self.target_dir):
            return {"success": False, "error": "target dir unavailable", "written": False}
        try:
            data = source.read_text(encoding="utf-8")
            out_path.write_text(data, encoding="utf-8")
            log.info("Copied verbatim: %s", out_path.name)
            return {
                "success": True,
                "written": True,
                "output_path": str(out_path),
                "source_chars": len(data),
                "cleaned_chars": len(data),
                "mode": "copy",
            }
        except Exception as e:
            log.error("Failed to copy %s: %s", source, e)
            return {"success": False, "error": str(e), "written": False}

    def process_file(self, source: Path, dry_run: bool = False,
                     use_llm: bool = False) -> dict:
        """Decide copy-vs-clean and process one file.

        Path:
          * metadata companion      -> copy verbatim
          * not fluffy (no -ly run)  -> copy verbatim
          * fluffy + use_llm=False   -> deterministic regex strip (fast)
          * fluffy + use_llm=True     -> LLM clean (slower, fallback)
        """
        # Metadata companions are always copied verbatim.
        if _is_metadata(source):
            if dry_run:
                log.info("[DRY RUN] would copy: %s", source.name)
                return {"written": False, "mode": "copy", "dry": True}
            return self._copy_verbatim(source)

        try:
            text = source.read_text(encoding="utf-8")
        except Exception as e:
            log.error("Cannot read %s: %s", source.name, e)
            return {"success": False, "error": str(e), "written": False}

        fluffy = needs_cleaning(text)
        context = {
            "text": text,
            "filename": source.name,
            "source_path": str(source),
        }

        if not fluffy:
            # Clean already — copy verbatim, no cleaning needed.
            if dry_run:
                log.info("[DRY RUN] would copy (clean): %s", source.name)
                return {"written": False, "mode": "copy", "dry": True}
            return self._copy_verbatim(source)

        # Fluffy — needs cleaning.
        if dry_run:
            mode = "llm" if use_llm else "regex"
            log.info("[DRY RUN] would clean (%s): %s", mode, source.name)
            return {"written": False, "mode": mode, "dry": True}

        if use_llm:
            if not self.preferred_model:
                self.load_model_info()
            if not self.preferred_model:
                log.error("No model configured — cannot run LLM for %s", source.name)
                return {"success": False, "error": "no models", "written": False}
            prompt = self.build_prompt(context)
            response = self.invoke_llm(
                prompt, system_prompt=EXTRACTOR_SYSTEM_PROMPT, max_tokens=64000
            )
            if not response:
                return {"success": False, "error": "no llm response", "written": False}
            context["mode"] = "llm"
            return self.handle_response(response, context)

        # Default: deterministic regex strip (instant, no hallucination).
        cleaned = clean_adverbs_regex(text)
        context["mode"] = "regex"
        return self.handle_response(cleaned, context)

    # ── Cycle ─────────────────────────────────────────────────

    def run_cycle(self, batch_size: int = BATCH_SIZE, dry_run: bool = False,
                 skip_existing: bool = True, use_llm: bool = False) -> dict:
        """Run a batched extractor cycle.

        1. Discover source files (deterministic)
        2. Optionally skip those already in TARGET_DIR
        3. Process up to `batch_size` files
        4. Fluffy files cleaned via regex (default) or LLM if use_llm=True
        """
        log.info("=" * 60)
        log.info("Extractor Harness Cycle")
        log.info("Time: %s", datetime.now().isoformat())
        log.info("Model: %s", self.preferred_model.model_name if self.preferred_model else "none")
        log.info("Source: %s", self.source_dir)
        log.info("Target: %s", self.target_dir)
        log.info("Batch size: %d", batch_size)
        log.info("=" * 60)

        files = discover_source_files(self.source_dir)
        if not files:
            log.info("Nothing to process.")
            return {"processed": 0}

        if skip_existing:
            before = len(files)
            files = [f for f in files if not already_processed(f, self.target_dir)]
            if len(files) != before:
                log.info("Skipped %d already-processed file(s)", before - len(files))

        batch = files[:batch_size]
        log.info("Files in batch: %d (of %d discovered)", len(batch), len(files))
        log.info("Cleaner: %s", "llm" if use_llm else "regex")

        if use_llm and not self.preferred_model:
            self.load_model_info()

        stats = {"processed": 0, "written": 0, "copied": 0, "regex": 0, "llm": 0, "errors": 0}

        for f in batch:
            result = self.process_file(f, dry_run=dry_run, use_llm=use_llm)
            if result.get("written"):
                stats["written"] += 1
                mode = result.get("mode")
                if mode == "copy":
                    stats["copied"] += 1
                elif mode == "llm":
                    stats["llm"] += 1
                elif mode == "regex":
                    stats["regex"] += 1
            elif not result.get("success") and not result.get("dry"):
                stats["errors"] += 1
            stats["processed"] += 1

        log.info("=" * 60)
        log.info("Extractor Summary: processed=%d written=%d (copied=%d regex=%d llm=%d) errors=%d",
                 stats["processed"], stats["written"], stats["copied"],
                 stats["regex"], stats["llm"], stats["errors"])
        log.info("=" * 60)
        return stats


if __name__ == "__main__":
    import sys
    _dry = "--dry-run" in sys.argv
    _llm = "--llm" in sys.argv
    _batch = BATCH_SIZE
    for i, a in enumerate(sys.argv):
        if a == "--batch" and i + 1 < len(sys.argv):
            try:
                _batch = int(sys.argv[i + 1])
            except ValueError:
                pass
    harness = ExtractorHarness()
    harness.run_cycle(batch_size=_batch, dry_run=_dry, use_llm=_llm)
