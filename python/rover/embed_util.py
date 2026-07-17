#!/usr/bin/env python3
"""
embed_util.py — Shared embedding infrastructure for rover reconciliation.

Provides database access, Ollama embedding with disk cache, cosine similarity,
and shared constants used by reconcile_completed.py, reconcile_embeddings.py,
and reconcile_agent_records.py.

Extracted from duplicate code across those three scripts. If you fix a bug
in psql(), embed_texts(), or cosine_similarity_matrix() — fix it here.
"""

from __future__ import annotations

import hashlib
import json
import logging
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np

log = logging.getLogger("embed_util")

# ── Constants ────────────────────────────────────────────────────────────

DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]
OLLAMA_API = "http://localhost:11434/api/embed"
CACHE_DIR = Path("/home/codex/dev/nexus/python/rover/.embedding_cache")
DEFAULT_MODEL = "snowflake-arctic-embed2"

# Confidence level ordering for min-confidence filtering.
CONFIDENCE_ORDER = {"high": 2, "medium": 1, "low": 0}


# ── Database helpers ─────────────────────────────────────────────────────

def psql(sql: str, timeout: int = 30) -> tuple[int, str]:
    """Execute SQL via docker exec on pgvector_db. Returns (returncode, stdout)."""
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, result.stdout.strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)"


# ── Embedding cache ──────────────────────────────────────────────────────

def _cache_key(text: str, model: str) -> str:
    """Deterministic cache key for an embedding."""
    h = hashlib.sha256(f"{model}:{text}".encode("utf-8")).hexdigest()
    return f"{model.replace('/', '_')}_{h}.npy"


def _load_cached(text: str, model: str) -> np.ndarray | None:
    """Load a cached embedding from disk. Returns None if missing or corrupt."""
    if not CACHE_DIR.is_dir():
        return None
    path = CACHE_DIR / _cache_key(text, model)
    if path.exists():
        try:
            return np.load(path, allow_pickle=False)
        except OSError:
            return None
    return None


def _save_cached(text: str, model: str, embedding: np.ndarray) -> None:
    """Save an embedding to disk cache."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / _cache_key(text, model)
    np.save(path, embedding)


# ── Embedding via Ollama ─────────────────────────────────────────────────

_MODEL_DIMS: dict[str, int] = {}


def embed_texts(texts: list[str], model: str = DEFAULT_MODEL) -> np.ndarray:
    """Get embeddings for a list of texts via Ollama /api/embed.

    Returns an (N, D) numpy array. Uses disk cache so re-runs are fast.
    Raises ValueError if texts is empty.
    """
    if not texts:
        raise ValueError("embed_texts requires at least one text")

    # Check cache first
    embeddings: list[np.ndarray | None] = [_load_cached(t, model) for t in texts]
    missing_indices = [i for i, e in enumerate(embeddings) if e is None]

    if missing_indices:
        missing_texts = [texts[i] for i in missing_indices]
        log.info("  Embedding %d texts via Ollama (%s)...", len(missing_texts), model)

        payload = {"model": model, "input": missing_texts}
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            OLLAMA_API,
            data=data,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                resp = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            log.error("Ollama HTTP %d: %s", e.code, e.read().decode()[:300])
            raise
        except Exception as e:
            log.error("Ollama request failed: %s", e)
            raise

        raw_embeddings = resp.get("embeddings", [])
        if len(raw_embeddings) != len(missing_texts):
            raise RuntimeError(
                f"Ollama returned {len(raw_embeddings)} embeddings for {len(missing_texts)} texts"
            )

        for idx_in_missing, global_idx in enumerate(missing_indices):
            vec = np.array(raw_embeddings[idx_in_missing], dtype=np.float32)
            embeddings[global_idx] = vec
            _save_cached(texts[global_idx], model, vec)
            if model not in _MODEL_DIMS:
                _MODEL_DIMS[model] = vec.shape[0]

    result = np.stack([e for e in embeddings if e is not None])
    if model in _MODEL_DIMS and result.shape[1] != _MODEL_DIMS[model]:
        raise RuntimeError(
            f"Dimension mismatch for model {model}: "
            f"expected {_MODEL_DIMS[model]}, got {result.shape[1]}"
        )
    return result


def cosine_similarity_matrix(
    candidate_embeddings: np.ndarray,
    reference_embeddings: np.ndarray,
) -> np.ndarray:
    """Compute cosine similarity between candidates (rows) and references (cols).

    Returns an (N_candidates, N_references) matrix.
    Works for both plan embeddings and agent record embeddings as the reference.
    """
    cand_norm = candidate_embeddings / (
        np.linalg.norm(candidate_embeddings, axis=1, keepdims=True) + 1e-8
    )
    ref_norm = reference_embeddings / (
        np.linalg.norm(reference_embeddings, axis=1, keepdims=True) + 1e-8
    )
    return cand_norm @ ref_norm.T


# ── Text preparation helpers ─────────────────────────────────────────────

def build_candidate_text(candidate: dict) -> str:
    """Build a rich text representation of a harvest candidate for embedding.

    Used by reconcile_embeddings.py and reconcile_agent_records.py.
    """
    parts = [f"Candidate: {candidate.get('title', '')}"]
    intent = candidate.get("intent", "")
    if intent:
        parts.append(f"Intent: {intent}")
    return "\n".join(parts)
