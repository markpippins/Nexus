"""Compat shim restoring the lost rover/embed_util module.

Delegates to the tiered provider chain (decision 8ae276bf) in
bin/embed_client.py so legacy consumers keep their import surface:
    from embed_util import embed_texts
Returns a numpy array (N x 768) matching the original contract.
"""
import sys

import numpy as np

sys.path.insert(0, "/home/codex/dev/nexus/bin")
from embed_client import embed_texts as _tiered_embed  # noqa: E402


def embed_texts(texts, model="nomic-embed-text", **_kw):
    """Embed texts via NIM/Gemini/OpenRouter -> local-ollama fallback chain."""
    vectors, _provider = _tiered_embed([t if isinstance(t, str) else str(t) for t in texts])
    return np.array(vectors, dtype=np.float32)


def cosine_similarity_matrix(
    candidate_embeddings: np.ndarray,
    reference_embeddings: np.ndarray,
) -> np.ndarray:
    """Compute cosine similarity between candidates (rows) and references (cols).

    Returns an (N_candidates, N_references) matrix.
    Restored from the pre-retirement rover/embed_util.py (commit f116d9ae^)
    so the restored agenda_matcher.py and other legacy consumers keep their
    import surface.
    """
    cand_norm = candidate_embeddings / (
        np.linalg.norm(candidate_embeddings, axis=1, keepdims=True) + 1e-8
    )
    ref_norm = reference_embeddings / (
        np.linalg.norm(reference_embeddings, axis=1, keepdims=True) + 1e-8
    )
    return cand_norm @ ref_norm.T
