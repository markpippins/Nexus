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
