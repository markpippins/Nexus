import json, os, subprocess, urllib.request, urllib.error

DEFAULT_MODEL = "deepseek-coder:latest"
DEFAULT_PORT = 11434
OLLAMA_BASE = f"http://localhost:{DEFAULT_PORT}"

MODEL_MAP = {
    "vocabulary": "deepseek-coder:latest",
    "requirements": "deepseek-coder:latest",
    "typespec": "deepseek-coder:latest",
    "refactor": "deepseek-coder:latest",
}


def call_ollama(prompt, model=None, temperature=0.3):
    """Send a prompt to Ollama and return the parsed JSON response.

    Returns (result_dict, error_string).
    On success, error is None.
    On failure, result is None and error is a message.
    """
    model = model or DEFAULT_MODEL
    payload = json.dumps({
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": temperature},
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{OLLAMA_BASE}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            response_text = body.get("response", "").strip()
    except urllib.error.URLError as e:
        return None, f"Ollama connection refused ({e}). Is Ollama running on port {DEFAULT_PORT}?"
    except Exception as e:
        return None, f"Ollama error: {e}"

    # Try to extract JSON from the response (LLMs may wrap in markdown)
    result = _extract_json(response_text)
    if result is None:
        return None, f"Could not parse JSON from Ollama response: {response_text[:300]}"
    return result, None


def _extract_json(text):
    """Extract JSON from text that may contain markdown code blocks."""
    # Strip markdown code fences
    if "```" in text:
        lines = text.split("\n")
        json_lines = []
        in_code_block = False
        for line in lines:
            if line.strip().startswith("```"):
                in_code_block = not in_code_block
                continue
            if in_code_block:
                json_lines.append(line)
        text = "\n".join(json_lines)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON object in text
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
    return None


def get_model_for_step(step_name):
    """Return the model to use for a given step."""
    return MODEL_MAP.get(step_name, DEFAULT_MODEL)


def check_ollama():
    """Check if Ollama is running. Returns (True, models_list) or (False, error)."""
    req = urllib.request.Request(f"{OLLAMA_BASE}/api/tags")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            models = [m["name"] for m in body.get("models", [])]
            return True, models
    except Exception as e:
        return False, str(e)


_WARMED_MODELS = set()


def warmup_model(model=None):
    """Warm up a model by sending a lightweight prompt.

    Returns (True, None) on success, (False, error) on failure.
    Already-warmed models are skipped.
    """
    model = model or DEFAULT_MODEL
    if model in _WARMED_MODELS:
        return True, None

    # Use /api/chat for warmup (doesn't require JSON response)
    payload = json.dumps({
        "model": model,
        "prompt": "OK",
        "stream": False,
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{OLLAMA_BASE}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            if body.get("done", False):
                _WARMED_MODELS.add(model)
                return True, None
            return False, "Model did not complete warmup"
    except urllib.error.URLError as e:
        return False, f"Connection refused: {e}"
    except Exception as e:
        return False, str(e)


def warmup_all():
    """Warm up all models in MODEL_MAP."""
    warmed = set()
    for step_name, model in MODEL_MAP.items():
        if model in warmed:
            continue
        ok, err = warmup_model(model)
        if ok:
            warmed.add(model)
            print(f"  Warmed up model: {model}")
        else:
            print(f"  WARNING: Could not warm up {model}: {err}")
    return warmed
