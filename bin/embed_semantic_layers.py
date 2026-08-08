#!/usr/bin/env python3
"""
Unified Semantic Embedding Backfill — three recall layers for planner search.

    Layer A: knowledge.graph_entity_embeddings    (KG entities: work_requests, plans, actors...)
    Layer B: semantics.source_observation_embeddings (transcripts, session logs, audit docs)
    Layer C: nebula.agent_record_embeddings       (agent records: "was this discussed/done?")

Uses Ollama nomic-embed-text (768-dim) with batched /api/embed + disk cache
(via rover/embed_util.py). Idempotent: rows are skipped when an embedding
already exists for the source row. Dry-run by default; pass --commit to write.

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate
    python3 bin/embed_semantic_layers.py --dry-run
    python3 bin/embed_semantic_layers.py --commit
    python3 bin/embed_semantic_layers.py --commit --layers A,B
    python3 bin/embed_semantic_layers.py --create-tables --commit --limit 50
"""

from __future__ import annotations

import argparse
import html as html_lib
import logging
import os
import re
import sys
import time
import urllib.error
from html.parser import HTMLParser
from pathlib import Path

import numpy as np
import psycopg2

sys.path.insert(0, "/home/codex/dev/nexus/python/rover")
from embed_util import embed_texts  # noqa: E402


def _fit_embed(texts: list[str], model: str) -> np.ndarray:
    """Embed a list, recovering from Ollama's context-length 400.

    A single over-long text fails its whole request. On a 400 we split the
    list in half and recurse; a lone text that still exceeds the window gets
    progressively harder truncation until it fits."""
    try:
        return embed_texts(texts, model=model)
    except urllib.error.HTTPError as e:
        if e.code != 400:
            raise
        if len(texts) == 1:
            t = texts[0]
            budget = len(t)
            while budget > 200:
                budget //= 2
                try:
                    return embed_texts([t[:budget]], model=model)
                except urllib.error.HTTPError as e2:
                    if e2.code != 400:
                        raise
            return embed_texts([t[:200]], model=model)
        mid = len(texts) // 2
        return np.vstack([_fit_embed(texts[:mid], model), _fit_embed(texts[mid:], model)])


def embed_texts_chunked(texts: list[str], model: str, chunk_size: int = 64) -> np.ndarray:
    """embed_texts in chunks: a single Ollama request for ~1,800 texts exceeds
    urllib's 600s timeout (and caches nothing until the whole request returns).
    Chunking keeps requests small, caches each chunk immediately, and loses at
    most one chunk on a timeout. Context-length 400s are recovered per chunk
    by _fit_embed."""
    parts = [texts[i:i + chunk_size] for i in range(0, len(texts), chunk_size)]
    vecs = [_fit_embed(p, model=model) for p in parts]
    return np.vstack(vecs)

LOG_DIR = Path("/home/codex/dev/nexus/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stderr),
        logging.FileHandler(LOG_DIR / "embed_semantic_layers.log"),
    ],
)
log = logging.getLogger("embed_layers")

# ── Config ────────────────────────────────────────────────────────────
EMBED_MODEL = "nomic-embed-text"
DB_DSN = "host=localhost port=5432 dbname=nexus user=pguser password=pgpass"

# Layer B scope — the "text-bearing" observations worth embedding.
# Transcripts + session logs + plans always; filesystem observations only
# when they are documentation (not source code / binaries / sourcemaps).
TEXT_DOC_EXTS = {".md", ".markdown", ".log", ".txt", ".rst", ".org", ".csv"}
# nomic-embed-text context window is 2048 tokens. A hard char cap is
# unreliable — dense mixed content (code + prose) runs ~2.5 chars/token,
# so a 6k char cap can still exceed the window. truncate_for_embed()
# estimates tokens and cuts conservatively at ~1,600 tokens (~4,000 chars).
EMBED_MAX_TOKENS = 1600
CHARS_PER_TOKEN_EST = 2.5
EMBED_CHAR_BUDGET = int(EMBED_MAX_TOKENS * CHARS_PER_TOKEN_EST)  # 4000
MAX_RECORD_CHARS = 1200      # agent record content truncation (token-safe)
EMBED_CHUNK = 32             # embed+write granularity: a killed run keeps DB progress

# ── HTML → text ───────────────────────────────────────────────────────

class _TextExtractor(HTMLParser):
    """Pull readable text out of a chat-transcript HTML export."""

    SKIP_TAGS = {"script", "style", "head", "nav", "footer", "svg", "noscript"}
    BREAK_TAGS = {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5",
                  "pre", "blockquote", "tr", "article", "section"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP_TAGS:
            self.skip_depth += 1
        elif self.skip_depth == 0 and tag in self.BREAK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP_TAGS and self.skip_depth > 0:
            self.skip_depth -= 1

    def handle_data(self, data):
        if self.skip_depth == 0:
            self.parts.append(data)

    def text(self) -> str:
        raw = "".join(self.parts)
        raw = re.sub(r"[ \t]+", " ", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        return raw.strip()


def strip_html(file_path: str) -> str:
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(2_500_000)  # cap read for giant exports
    except OSError:
        return ""
    extractor = _TextExtractor()
    try:
        extractor.feed(content)
    except Exception:  # malformed HTML — fall back to tag-strip regex
        content = re.sub(r"<script.*?</script>", " ", content, flags=re.S | re.I)
        content = re.sub(r"<style.*?</style>", " ", content, flags=re.S | re.I)
        content = re.sub(r"<[^>]+>", " ", content)
        content = html_lib.unescape(content)
        extractor.parts = [content]
    text = extractor.text()
    return truncate_for_embed(text)


def truncate_for_embed(text: str) -> str:
    """Truncate text so it fits nomic-embed-text's 2048-token window with
    headroom. Cuts on a word boundary near the char budget."""
    if not text or len(text) <= EMBED_CHAR_BUDGET:
        return text
    cut = text[:EMBED_CHAR_BUDGET]
    idx = cut.rfind(" ")
    if idx > int(EMBED_CHAR_BUDGET * 0.75):
        cut = cut[:idx]
    return cut


def read_plain_text(file_path: str) -> str:
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(EMBED_CHAR_BUDGET * 2)
    except OSError:
        return ""
    return truncate_for_embed(content)


def _resolve_path(raw_location: str) -> str:
    """Resolve a raw_location to an absolute path.

    Locations may be absolute, file:// prefixed, or relative to the workspace
    root (e.g. 'nexus/audit/CONDUIT_DATA/sessions/foo.log').
    """
    path = raw_location
    if path.startswith("file://"):
        path = path[len("file://"):]
    if os.path.isabs(path):
        return path
    # Relative to workspace root
    candidate = os.path.join("/home/codex/dev", path)
    if os.path.exists(candidate):
        return candidate
    return path


def load_observation_text(asset_kind: str, raw_location: str) -> str:
    """Build embed text for a Layer B source observation from its raw file."""
    path = _resolve_path(raw_location)
    if not path or not os.path.exists(path):
        return ""
    lower = path.lower()
    if lower.endswith((".html", ".htm")):
        return strip_html(path)
    return read_plain_text(path)


# ── Data fetching ─────────────────────────────────────────────────────

def fetch_kg_entities(cur) -> list[dict]:
    """Layer A: KG entities without embeddings, embed_text = description/properties."""
    cur.execute(
        """
        SELECT ge.id, ge.section, ge.entity_id, ge.name, ge.entity_type,
               COALESCE(ge.description, '') AS description,
               ge.properties::text AS props_json
        FROM knowledge.graph_entities ge
        LEFT JOIN knowledge.graph_entity_embeddings ee ON ee.entity_id = ge.id
        WHERE ee.id IS NULL
        ORDER BY ge.section, ge.name
        """
    )
    import json as _json

    rows = []
    for entity_id, section, kg_id, name, entity_type, description, props_raw in cur.fetchall():
        embed_text = (description or "").strip()
        if not embed_text or len(embed_text) < 30:
            try:
                props = _json.loads(props_raw or "{}")
                for key in ("observation", "rationale", "statement", "description"):
                    val = props.get(key, "")
                    if isinstance(val, str) and len(val) > 20:
                        embed_text = val
                        break
            except (_json.JSONDecodeError, TypeError):
                pass
        if not embed_text or len(embed_text) < 10:
            parts = [name or "", (section or "").replace("_", " "), entity_type or ""]
            embed_text = " ".join(p for p in parts if p and p.strip())
        rows.append({
            "id": entity_id, "section": section, "entity_id": kg_id,
            "name": name, "embed_text": embed_text,
        })
    return rows


def fetch_source_observations(cur) -> list[tuple]:
    """Layer B: SQL fetch of observations needing embeddings (NO file I/O).

    File reading is deliberately deferred to build_observation_rows() so the
    transaction can be committed before long disk/HTML work — the server kills
    idle-in-transaction connections after 30s.
    """
    # TEXT_DOC_EXTS holds '.md'-style entries; SQL split_part returns 'md'
    ext_cond = ", ".join("'%s'" % e.lstrip(".") for e in TEXT_DOC_EXTS)
    cur.execute(
        f"""
        SELECT so.id, ca.asset_kind, so.platform, so.raw_location
        FROM semantics.source_observation so
        JOIN semantics.asset_revision ar ON ar.id = so.revision_id
        JOIN semantics.canonical_asset ca ON ca.id = ar.asset_id
        LEFT JOIN semantics.source_observation_embeddings see
               ON see.source_observation_id = so.id
        WHERE see.id IS NULL
          AND so.expired_at IS NULL
          AND (
               ca.asset_kind IN ('transcript', 'session_log', 'plan',
                                 'implementation_plan', 'document', 'report', 'note')
               OR (ca.asset_kind = 'file'
                   AND lower(split_part(so.raw_location, '.', -1)) IN ({ext_cond}))
              )
        ORDER BY ca.asset_kind, so.raw_location
        """
    )
    return cur.fetchall()


def build_observation_rows(raw_rows: list[tuple]) -> list[dict]:
    """Layer B: read files and build embed texts. Run AFTER the transaction is
    committed so long file I/O never holds an open connection."""
    rows = []
    for obs_id, asset_kind, platform, raw_location in raw_rows:
        text = load_observation_text(asset_kind, raw_location)
        if not text.strip():
            continue
        embed_text = f"[{asset_kind}] {raw_location}\n{text}"
        rows.append({
            "source_observation_id": obs_id, "asset_kind": asset_kind,
            "platform": platform, "raw_location": raw_location,
            "embed_text": embed_text,
        })
    return rows


def fetch_agent_records(cur) -> list[dict]:
    """Layer C: agent records without embeddings (title + content)."""
    cur.execute(
        """
        SELECT ar.id, ar.role, ar.record_type, ar.title, ar.content
        FROM nebula.agent_records ar
        LEFT JOIN nebula.agent_record_embeddings are
               ON are.agent_record_id = ar.id
        WHERE are.id IS NULL
        ORDER BY ar.created_at
        """
    )
    rows = []
    for rec_id, role, record_type, title, content in cur.fetchall():
        content = (content or "").strip()
        title = (title or "").strip()
        if not title and not content:
            continue
        embed_text = f"Role: {role or ''}\nRecord Type: {record_type or ''}\nTitle: {title}\nContent: {content[:MAX_RECORD_CHARS]}"
        rows.append({
            "agent_record_id": rec_id, "role": role, "record_type": record_type,
            "title": title, "embed_text": embed_text,
        })
    return rows


# ── Persistence ───────────────────────────────────────────────────────

CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS semantics.source_observation_embeddings (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_observation_id uuid NOT NULL UNIQUE
                        REFERENCES semantics.source_observation(id),
    asset_kind          text NOT NULL,
    platform            text,
    raw_location        text,
    embed_text          text NOT NULL,
    embedding           vector(768),
    model_used          text NOT NULL DEFAULT 'nomic-embed-text',
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS nebula.agent_record_embeddings (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_record_id   uuid NOT NULL UNIQUE,
    role              text,
    record_type       text,
    title             text,
    embed_text        text NOT NULL,
    embedding         vector(768),
    model_used        text NOT NULL DEFAULT 'nomic-embed-text',
    created_at        timestamptz NOT NULL DEFAULT now()
);
"""


def upsert_embeddings(conn, table: str, rows: list[dict], embed_array: np.ndarray, cols: list[str]) -> int:
    """Batch upsert rows + their embeddings. cols must match row keys (embedding appended)."""
    if not rows:
        return 0
    cur = conn.cursor()
    inserted = 0
    batch_sql = f"INSERT INTO {table} ({', '.join(cols + ['embedding', 'model_used'])}) VALUES ({', '.join(['%s'] * (len(cols) + 2))})"
    for row, vec in zip(rows, embed_array):
        vec_str = "[" + ",".join(f"{x:.6f}" for x in vec) + "]"
        values = [row[c] for c in cols] + [vec_str, EMBED_MODEL]
        try:
            cur.execute(batch_sql, values)
            inserted += 1
        except psycopg2.errors.UniqueViolation:
            conn.rollback()
            cur = conn.cursor()
        except Exception as ex:
            log.error("Insert failed for %s: %s", row.get("title") or row.get("raw_location") or row.get("id"), ex)
    conn.commit()
    cur.close()
    return inserted


def get_conn():
    """Open a connection with keepalives; the shared DB sees heavy churn from
    other services, so layers use short-lived connections + one retry."""
    return psycopg2.connect(
        DB_DSN,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
    )


# ── Main ──────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="Embed semantic layers A (KG), B (observations), C (agent records)")
    parser.add_argument("--dry-run", action="store_true", help="Report what would be embedded (default when no --commit)")
    parser.add_argument("--commit", action="store_true", help="Actually write embeddings to the database")
    parser.add_argument("--layers", default="A,B,C", help="Comma-separated layers to run (A,B,C)")
    parser.add_argument("--create-tables", action="store_true", help="Create Layer B/C tables if missing")
    parser.add_argument("--limit", type=int, default=None, help="Cap total rows processed (debug)")
    args = parser.parse_args()

    commit = args.commit
    if not commit:
        log.info("DRY RUN — use --commit to write embeddings")
    layers = {s.strip().upper() for s in args.layers.split(",") if s.strip()}

    if args.create_tables:
        log.info("Creating Layer B/C tables if missing...")
        conn = get_conn()
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(CREATE_TABLES_SQL)
        cur.close()
        conn.close()
        log.info("  tables ensured")

    overall_start = time.time()
    total_rows = 0

    def with_retry(fn):
        """Run fn with a fresh connection; retry once on connection churn."""
        for attempt in (1, 2):
            conn = get_conn()
            conn.autocommit = False
            try:
                return fn(conn)
            except psycopg2.OperationalError as ex:
                log.warning("DB connection churn (attempt %d): %s", attempt, ex)
                conn.close()
                if attempt == 2:
                    raise
            finally:
                if not conn.closed:
                    conn.close()

    # ── Layer A: KG entities ─────────────────────────────────────────
    # NOTE: graph_entity_embeddings.entity_id holds the graph_entities.id (uuid),
    # and kg_entity_id holds the string entity id — handled explicitly below.
    if "A" in layers:
        def run_a(conn):
            cur = conn.cursor()
            rows = fetch_kg_entities(cur)
            cur.close()
            conn.commit()  # end fetch tx — server kills idle-in-tx conns after 30s
            log.info("Layer A (KG entities): %d to embed", len(rows))
            if not rows:
                return 0
            if args.limit:
                rows = rows[:args.limit]
            texts = [r["embed_text"] for r in rows]
            if not commit:
                embed_texts_chunked(texts, model=EMBED_MODEL)
                log.info("Layer A: would embed %d entities", len(rows))
                log.info("Layer A text stats: min=%d max=%d mean=%d",
                         min(len(t) for t in texts), max(len(t) for t in texts),
                         sum(len(t) for t in texts) // len(texts))
                return 0
            # Incremental: embed + write one chunk at a time so a killed run
            # keeps its DB progress (re-runs skip already-embedded rows).
            inserted = 0
            for i in range(0, len(rows), EMBED_CHUNK):
                chunk = rows[i:i + EMBED_CHUNK]
                emb = _fit_embed([r["embed_text"] for r in chunk], model=EMBED_MODEL)
                cur2 = conn.cursor()
                for row, vec in zip(chunk, emb):
                    vec_str = "[" + ",".join(f"{x:.6f}" for x in vec) + "]"
                    try:
                        cur2.execute(
                            "INSERT INTO knowledge.graph_entity_embeddings "
                            "(entity_id, section, kg_entity_id, name, embed_text, embedding, model_used) "
                            "VALUES (%s,%s,%s,%s,%s,%s::vector,%s) "
                            "ON CONFLICT (entity_id) DO UPDATE SET "
                            "embedding=EXCLUDED.embedding, embed_text=EXCLUDED.embed_text, "
                            "name=EXCLUDED.name",
                            (row["id"], row["section"], row["entity_id"], row["name"],
                             row["embed_text"], vec_str, EMBED_MODEL),
                        )
                        inserted += 1
                    except Exception as ex:
                        log.error("Layer A insert failed: %s", ex)
                conn.commit()
                cur2.close()
                log.info("Layer A: wrote %d embeddings (running total)", inserted)
            return inserted

        total_rows += with_retry(run_a)

    # ── Layer B: source observations ─────────────────────────────────
    if "B" in layers:
        def run_b(conn):
            cur = conn.cursor()
            raw = fetch_source_observations(cur)
            cur.close()
            conn.commit()  # end fetch tx — file I/O below is long, must not hold it
            rows = build_observation_rows(raw)
            log.info("Layer B (source observations): %d to embed", len(rows))
            if not rows:
                return 0
            if args.limit:
                rows = rows[:args.limit]
            texts = [r["embed_text"] for r in rows]
            if not commit:
                embed_texts_chunked(texts, model=EMBED_MODEL)
                log.info("Layer B: would embed %d observations", len(rows))
                log.info("Layer B text stats: min=%d max=%d mean=%d",
                         min(len(t) for t in texts), max(len(t) for t in texts),
                         sum(len(t) for t in texts) // len(texts))
                return 0
            inserted = 0
            for i in range(0, len(rows), EMBED_CHUNK):
                chunk = rows[i:i + EMBED_CHUNK]
                emb = _fit_embed([r["embed_text"] for r in chunk], model=EMBED_MODEL)
                inserted += upsert_embeddings(
                    conn, "semantics.source_observation_embeddings", chunk, emb,
                    ["source_observation_id", "asset_kind", "platform", "raw_location", "embed_text"],
                )
                log.info("Layer B: wrote %d embeddings (running total)", inserted)
            return inserted

        total_rows += with_retry(run_b)

    # ── Layer C: agent records ───────────────────────────────────────
    if "C" in layers:
        def run_c(conn):
            cur = conn.cursor()
            rows = fetch_agent_records(cur)
            cur.close()
            conn.commit()  # end fetch tx — server kills idle-in-tx conns after 30s
            log.info("Layer C (agent records): %d to embed", len(rows))
            if not rows:
                return 0
            if args.limit:
                rows = rows[:args.limit]
            texts = [r["embed_text"] for r in rows]
            if not commit:
                embed_texts_chunked(texts, model=EMBED_MODEL)
                log.info("Layer C: would embed %d agent records", len(rows))
                log.info("Layer C text stats: min=%d max=%d mean=%d",
                         min(len(t) for t in texts), max(len(t) for t in texts),
                         sum(len(t) for t in texts) // len(texts))
                return 0
            inserted = 0
            for i in range(0, len(rows), EMBED_CHUNK):
                chunk = rows[i:i + EMBED_CHUNK]
                emb = _fit_embed([r["embed_text"] for r in chunk], model=EMBED_MODEL)
                inserted += upsert_embeddings(
                    conn, "nebula.agent_record_embeddings", chunk, emb,
                    ["agent_record_id", "role", "record_type", "title", "embed_text"],
                )
                log.info("Layer C: wrote %d embeddings (running total)", inserted)
            return inserted

        total_rows += with_retry(run_c)

    log.info("=" * 60)
    log.info("TOTAL embedded: %d (%.1fs)", total_rows, time.time() - overall_start)
    log.info("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
