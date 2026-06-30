import logging
from typing import Dict, Optional

_log = logging.getLogger("conduit.token_estimator")

_ENCODING_CACHE: Dict[str, object] = {}
_HEURISTIC_CHARS_PER_TOKEN = 4.0

_MODEL_ENCODING_MAP: Dict[str, str] = {
    "gpt-4o": "cl100k_base",
    "gpt-4o-mini": "cl100k_base",
    "gpt-4": "cl100k_base",
    "gpt-3.5-turbo": "cl100k_base",
    "claude-sonnet-4": "cl100k_base",
    "claude-sonnet-4-20250514": "cl100k_base",
    "claude-3-haiku": "cl100k_base",
    "claude-3-opus": "cl100k_base",
    "text-embedding-ada-002": "cl100k_base",
    "opencode/big-pickle": "cl100k_base",
    "ollama/qwen2.5-coder": "cl100k_base",
}


def _get_encoding(model_name: str):
    encoding_name = _MODEL_ENCODING_MAP.get(model_name)
    if encoding_name and encoding_name in _ENCODING_CACHE:
        return _ENCODING_CACHE[encoding_name]
    try:
        import tiktoken
        if encoding_name:
            enc = tiktoken.get_encoding(encoding_name)
        else:
            enc = tiktoken.get_encoding("cl100k_base")
        _ENCODING_CACHE[encoding_name or "cl100k_base"] = enc
        return enc
    except Exception:
        return None


def estimate_tokens(text: str, model_name: str = "") -> int:
    enc = _get_encoding(model_name)
    if enc:
        try:
            return len(enc.encode(text))
        except Exception:
            pass
    return int(len(text) / _HEURISTIC_CHARS_PER_TOKEN) or 1


def estimate_cost(
    input_tokens: int,
    output_tokens: int,
    model_name: str,
    pricing: Dict[str, Dict[str, float]],
) -> float:
    model_pricing = pricing.get(model_name)
    if not model_pricing:
        return 0.0
    input_cost = input_tokens * model_pricing.get("input_price_per_token", 0)
    output_cost = output_tokens * model_pricing.get("output_price_per_token", 0)
    return round(input_cost + output_cost, 6)


def load_pricing(db) -> Dict[str, Dict[str, float]]:
    result: Dict[str, Dict[str, float]] = {}
    try:
        rows = db.fetch_model_pricing()
        for row in rows:
            result[row["model_name"]] = {
                "input_price_per_token": float(row["input_price_per_token"]),
                "output_price_per_token": float(row["output_price_per_token"]),
            }
    except Exception:
        _log.warning("load_pricing: failed to fetch pricing, returning empty map")
    return result
