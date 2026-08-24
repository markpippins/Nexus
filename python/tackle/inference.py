#!/usr/bin/env python3
"""
tackle.inference — Role-resolved LLM inference via tackle-mcp.

Resolves the active model config for a role through tackle-mcp (port 3400),
then makes the actual HTTP API call to whichever provider is configured.
Supports automatic fallback chaining when a model fails.

Usage::

    from tackle.inference import call_llm

    # Single call — uses the primary config for the role
    reply = call_llm("summarise this text", role="rover")
    print(reply)

    # With fallback: if the primary model fails (or is opencode-harness),
    # tries the next fallback in priority order, then the next, etc.
    reply = call_llm("summarise this text", role="rover", fallback=True)
"""

import json
import logging
import os
import subprocess
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

from tackle.db import get_role_config, get_fallback_models

OPENCODE_BIN = os.environ.get("OPENCODE_BIN", "/home/codex/.opencode/bin/opencode")
OPENCODE_CLI_TIMEOUT_SECONDS = int(os.environ.get("OPENCODE_CLI_TIMEOUT_SECONDS", "300"))

_log = logging.getLogger("tackle.inference")


# ── Provider-specific API callers ──────────────────────────────────


def _call_openai(
    model: str,
    messages: list[Dict[str, str]],
    api_key: str,
    endpoint_url: str,
    temperature: float = 0.1,
    max_tokens: int = 8192,
) -> Optional[str]:
    """Call an OpenAI-compatible chat completions endpoint."""
    url = endpoint_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            body = json.loads(resp.read().decode())
        return body["choices"][0]["message"]["content"]
    except Exception as e:
        _log.warning("OpenAI call failed: %s", e)
        return None


def _call_google(
    model: str,
    messages: list[Dict[str, str]],
    api_key: str,
    endpoint_url: str,
    temperature: float = 0.1,
    max_tokens: int = 8192,
) -> Optional[str]:
    """Call a Google Gemini generateContent endpoint."""
    # Build Gemini contents array from messages
    contents = []
    system_instruction = None
    for msg in messages:
        if msg["role"] == "system":
            system_instruction = {"parts": [{"text": msg["content"]}]}
        else:
            contents.append({
                "role": "user" if msg["role"] == "user" else "model",
                "parts": [{"text": msg["content"]}],
            })

    # If the endpoint includes /v1/ or v1beta use the full path
    base = endpoint_url.rstrip("/")
    if "/v1beta" in base or "/v1" in base:
        url = f"{base}/models/{model}:generateContent?key={api_key}"
    else:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    payload: Dict[str, Any] = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    if system_instruction:
        payload["systemInstruction"] = system_instruction

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            body = json.loads(resp.read().decode())
        candidates = body.get("candidates", [])
        if not candidates:
            return None
        return candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    except Exception as e:
        _log.warning("Google/Gemini call failed: %s", e)
        return None


def _call_anthropic(
    model: str,
    messages: list[Dict[str, str]],
    api_key: str,
    endpoint_url: str,
    temperature: float = 0.1,
    max_tokens: int = 8192,
) -> Optional[str]:
    """Call an Anthropic messages endpoint."""
    base = endpoint_url.rstrip("/")
    url = f"{base}/messages"

    # Separate system prompt from messages
    system = None
    msgs = []
    for m in messages:
        if m["role"] == "system":
            system = m["content"]
        else:
            msgs.append({
                "role": "user" if m["role"] == "user" else "assistant",
                "content": m["content"],
            })

    payload: Dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": msgs,
    }
    if system:
        payload["system"] = system
    if temperature is not None:
        payload["temperature"] = temperature

    # Use anthropic-version header for API versioning
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            body = json.loads(resp.read().decode())
        return body["content"][0]["text"]
    except Exception as e:
        _log.warning("Anthropic call failed: %s", e)
        return None


def _call_ollama(
    model: str,
    messages: list[Dict[str, str]],
    api_key: str,
    endpoint_url: str,
    temperature: float = 0.1,
    max_tokens: int = 8192,
) -> Optional[str]:
    """Call a local Ollama chat endpoint."""
    base = endpoint_url.rstrip("/")
    url = f"{base}/api/chat"
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            body = json.loads(resp.read().decode())
        return body["message"]["content"]
    except Exception as e:
        _log.warning("Ollama call failed: %s", e)
        return None


# ── Provider dispatch ──────────────────────────────────────────────

_PROVIDER_CALLERS = {
    "openai": _call_openai,
    "google": _call_google,
    "anthropic": _call_anthropic,
    "ollama": _call_ollama,
}


def _call_opencode_cli(
    model: str,
    messages: list[Dict[str, str]],
) -> Optional[str]:
    """Invoke the opencode CLI harness for a role whose config resolves to
    provider_type='opencode'.

    Previously these entries were SKIPPED entirely — which made the operator
    messagebox permanently broken whenever the whole chain was opencode-typed
    ("all models for this role are currently unavailable"). The harvest
    pipeline already proves the CLI path works: ``opencode run -m <model>
    --pure <prompt>``.

    System-prompt injection is not supported by the run subcommand, so the
    system message is prepended to the prompt body.
    """
    prompt_parts = [m["content"] for m in messages if m.get("content")]
    prompt = "\n\n".join(prompt_parts)
    # The CLI requires fully-qualified model ids (provider/model). Role configs
    # frequently store bare ids ("x-preview-f-free"); a bare id makes the CLI
    # die with an opaque UnknownError JSON blob.
    if model and "/" not in model:
        model = f"opencode/{model}"
    cmd = [OPENCODE_BIN, "run"]
    if model:
        cmd += ["-m", model]
    cmd += ["--pure", prompt]
    last_err = None
    for attempt in range(2):  # one retry — CLI occasionally transient-fails
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=OPENCODE_CLI_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            _log.warning("opencode CLI timed out after %ds (model=%s)", OPENCODE_CLI_TIMEOUT_SECONDS, model)
            return None
        except FileNotFoundError:
            _log.error("opencode binary not found at %s", OPENCODE_BIN)
            return None
        if result.returncode == 0:
            text = (result.stdout or "").strip()
            if text:
                return text
            _log.warning("opencode CLI returned empty output (model=%s)", model)
            return None
        last_err = (result.stderr or result.stdout or "")[-300:]
        _log.warning(
            "opencode CLI exit %d (attempt %d/2, model=%s): %s",
            result.returncode, attempt + 1, model, last_err,
        )
        time.sleep(3)
    return None


def _call_provider(
    provider_type: str,
    model: str,
    messages: list[Dict[str, str]],
    api_key: str,
    endpoint_url: str,
    temperature: float = 0.1,
    max_tokens: int = 8192,
) -> Optional[str]:
    """Dispatch to the appropriate provider caller."""
    if provider_type == "opencode":
        return _call_opencode_cli(model, messages)
    caller = _PROVIDER_CALLERS.get(provider_type)
    if caller is None:
        _log.warning("Unsupported provider type: %s (model=%s)", provider_type, model)
        return None
    return caller(model, messages, api_key, endpoint_url, temperature, max_tokens)


# ── Public API ─────────────────────────────────────────────────────


def call_llm(
    prompt: str,
    *,
    role: str = "rover",
    system_prompt: Optional[str] = None,
    temperature: float = 0.1,
    max_tokens: int = 8192,
    fallback: bool = True,
    max_retries: int = 3,
) -> Optional[str]:
    """Call the LLM configured for *role*, returning the response text.

    Resolution order (``fallback=True``):
        1. Primary model config from ``tackle.db.get_role_config(role)``.
        2. Fallback models from ``tackle.db.get_fallback_models(role)``
           (each tried once; no inner retry loop beyond the per-provider
           attempt).
        3. If all fail, returns ``None``.

    With ``fallback=False``, only tries the primary config.

    Each model is tried once (with up to *max_retries* attempts for
    transient HTTP errors on that model).  If it fails, the next fallback
    is tried.

    Returns the response text, or ``None`` if all models/fallbacks fail.
    """
    # Build the messages list
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    # ── 1. Try primary config ────────────────────────────────────
    cfg = get_role_config(role)
    if cfg is None:
        _log.warning("call_llm: no config found for role=%s", role)
        return None

    provider_type = cfg.get("provider_type", "")
    model_id = cfg.get("model_identifier", "")
    api_key = cfg.get("api_key", "") or ""
    endpoint_url = cfg.get("endpoint_url", "") or ""

    # If the primary is an opencode harness (CLI-based), it is now INVOKED
    # via _call_opencode_cli (see _call_provider) rather than skipped —
    # skipping made roles with an all-opencode chain permanently unable to
    # answer ("all models for this role are currently unavailable").
    if provider_type == "opencode":
        _log.info(
            "Primary provider is 'opencode' (CLI harness) for role=%s — "
            "invoking CLI (%s)",
            role, model_id,
        )
        result = _call_opencode_cli(model_id, messages)
        if result is not None:
            return result
        _log.warning("Primary opencode CLI failed for role=%s", role)
    else:
        _log.info(
            "Calling primary: provider=%s model=%s role=%s",
            provider_type, model_id, role,
        )
        result = _call_with_retry(
            provider_type, model_id, messages,
            api_key, endpoint_url, temperature, max_tokens,
            max_retries,
        )
        if result is not None:
            return result
        _log.warning("Primary model failed for role=%s", role)

    # ── 2. Fallback chain ────────────────────────────────────────
    if not fallback:
        return None

    fallbacks = get_fallback_models(role)
    if not fallbacks:
        _log.warning("No fallback models for role=%s", role)
        return None

    for fb in fallbacks:
        fb_type = fb.get("provider_type", "")
        fb_model = fb.get("model_identifier", "")

        fb_key = fb.get("api_key", "") or api_key
        fb_url = fb.get("endpoint_url", "") or endpoint_url
        fb_harness = fb.get("harness_name", "")

        _log.info(
            "Trying fallback: provider=%s model=%s harness=%s role=%s",
            fb_type, fb_model, fb_harness, role,
        )
        if fb_type == "opencode":
            # CLI harness fallback — single attempt, no HTTP retry loop.
            result = _call_opencode_cli(fb_model, messages)
        else:
            result = _call_with_retry(
                fb_type, fb_model, messages,
                fb_key, fb_url, temperature, max_tokens,
                max_retries,
            )
        if result is not None:
            return result
        _log.warning("Fallback %s/%s failed for role=%s", fb_type, fb_model, role)

    _log.error("All models exhausted for role=%s", role)
    return None


def _call_with_retry(
    provider_type: str,
    model: str,
    messages: list[Dict[str, str]],
    api_key: str,
    endpoint_url: str,
    temperature: float,
    max_tokens: int,
    max_retries: int,
) -> Optional[str]:
    """Try a single model with retries for transient errors."""
    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            result = _call_provider(
                provider_type, model, messages,
                api_key, endpoint_url, temperature, max_tokens,
            )
            if result is not None:
                return result
        except Exception as e:
            last_err = e
            _log.warning(
                "  Attempt %d/%d failed for %s/%s: %s",
                attempt, max_retries, provider_type, model, e,
            )

        if attempt < max_retries:
            delay = attempt * 10  # linear backoff: 10s, 20s, 30s
            _log.info("  Retrying in %ds...", delay)
            time.sleep(delay)

    if last_err:
        _log.warning(
            "Exhausted %d retries for %s/%s: %s",
            max_retries, provider_type, model, last_err,
        )
    return None
