#!/usr/bin/env python3
"""
CIR Deterministic Patch Engine — CIR-1 through CIR-5 with CIR-SDM.

Diagnostic-only by default. Use --apply to write changes.

Usage:
    python tools/cir1/patch.py                     # dry-run (show diffs)
    python tools/cir1/patch.py --apply             # write changes

Design principle:
    CIR-1 violations are auto-removed (they are structurally broken).
    CIR-2/3/4/5 violations are reported but NOT wrapped by default.
    Use --apply to quarantine violations in-place.
"""

import difflib
import json
import sys
from pathlib import Path

FORBIDDEN_CROSS_LAYER_TOKENS = [
    "CEGL", "CER", "CCNF", "ExecutionRequest", "ExecutionState",
    "ADR-", "I1", "I2", "I3", "I4", "I5", "snapshot", "event fold",
]

EXECUTION_IMPLYING_FIELDS = [
    "mode", "retry_policy", "on_failure", "timeout",
    "backoff", "executor", "execution_state", "dispatch",
]

RUNTIME_STATE_KEYS = [
    "status", "state", "result", "decision",
]

SCHEMA_STATE_KEYS = [
    "execution_state", "current_run", "snapshot", "score",
]

SEMANTIC_CLASSES = {
    "execution_state": ["execution_state", "mode", "state"],
    "pipeline_intent": ["intent_source", "PIPELINE_INTENT"],
    "decision": ["decision", "result", "score"],
    "runtime_snapshot": ["snapshot", "snapshot_ref"],
    "execution_status": ["status", "current_run"],
}

# ─── CIR-SDM: Semantic Domain Model ─────────────────────────────────────────

def classify(path: str):
    p = path.lstrip("./")
    if any(x in p for x in [
        "node_modules", "__pycache__", ".git",
        "package-lock.json", "package.json",
        "/build/", "/target/", "/.angular/", "/.cache/",
    ]):
        return ("BUILD", None)
    if p.endswith(".schema.json") or "/schema/" in p:
        return ("SCHEMA", None)
    if any(x in p for x in ["/vectors/", "/tests/", "/logs/", "/samples/", "/specimens/"]):
        return ("DATA", None)
    if "pgv.state_machine" in p:
        return ("GOVERNANCE", "CANONICAL")
    if "transition_ledger" in p:
        return ("GOVERNANCE", "STATEFUL")
    if p.startswith("go/wrp/ccnf-ref/") and not any(x in p for x in ["/vectors/", "/tests/"]):
        return ("GOVERNANCE", "CANONICAL")
    if p.startswith(".agents/"):
        return ("GOVERNANCE", "ASPIRATIONAL")
    if p.startswith(".tools/") or p.startswith(".github/"):
        return ("GOVERNANCE", "CANONICAL")
    if "/runtime/" in p or "/executor/" in p:
        return ("RUNTIME", None)
    return ("DATA", None)


SUBTYPE_MODE = {
    "CANONICAL":    "AUTHORITATIVE",
    "ASPIRATIONAL": "STRUCTURAL",
    "STATEFUL":     "DERIVATIONAL",
}

DOMAIN_MODE = {
    "GOVERNANCE":    None,
    "RUNTIME":       "STATEFUL",
    "SCHEMA":        "STRUCTURAL",
    "DATA":          "STRUCTURAL",
    "BUILD":         "STRUCTURAL",
}


def resolve_mode(domain, subtype):
    if domain == "GOVERNANCE":
        return SUBTYPE_MODE[subtype]
    return DOMAIN_MODE[domain]


CIR_APPLY = {
    ("GOVERNANCE", "AUTHORITATIVE", 1): "STRICT",
    ("GOVERNANCE", "AUTHORITATIVE", 2): "STRICT_NATIVE",
    ("GOVERNANCE", "AUTHORITATIVE", 3): "STRICT",
    ("GOVERNANCE", "AUTHORITATIVE", 4): "STRICT",
    ("GOVERNANCE", "AUTHORITATIVE", 5): "STRICT",
    ("GOVERNANCE", "STRUCTURAL", 1): "STRICT",
    ("GOVERNANCE", "STRUCTURAL", 2): "STRICT",
    ("GOVERNANCE", "STRUCTURAL", 3): None,
    ("GOVERNANCE", "STRUCTURAL", 4): None,
    ("GOVERNANCE", "STRUCTURAL", 5): "STRICT",
    ("GOVERNANCE", "DERIVATIONAL", 1): "STRICT",
    ("GOVERNANCE", "DERIVATIONAL", 2): "STRICT",
    ("GOVERNANCE", "DERIVATIONAL", 3): None,
    ("GOVERNANCE", "DERIVATIONAL", 4): "SCHEMA",
    ("GOVERNANCE", "DERIVATIONAL", 5): "STRICT",
    ("RUNTIME", "STATEFUL", 1): "STRICT",
    ("RUNTIME", "STATEFUL", 2): None,
    ("RUNTIME", "STATEFUL", 3): "STRICT",
    ("RUNTIME", "STATEFUL", 4): "STRICT",
    ("RUNTIME", "STATEFUL", 5): "STRICT",
    ("SCHEMA", "STRUCTURAL", 1): "STRICT",
    ("SCHEMA", "STRUCTURAL", 2): None,
    ("SCHEMA", "STRUCTURAL", 3): None,
    ("SCHEMA", "STRUCTURAL", 4): None,
    ("SCHEMA", "STRUCTURAL", 5): "LIMITED",
    ("DATA", "STRUCTURAL", 1): "MINIMAL",
    ("DATA", "STRUCTURAL", 2): None,
    ("DATA", "STRUCTURAL", 3): None,
    ("DATA", "STRUCTURAL", 4): None,
    ("DATA", "STRUCTURAL", 5): None,
    ("BUILD", "STRUCTURAL", 1): "MINIMAL",
    ("BUILD", "STRUCTURAL", 2): None,
    ("BUILD", "STRUCTURAL", 3): None,
    ("BUILD", "STRUCTURAL", 4): None,
    ("BUILD", "STRUCTURAL", 5): None,
}


_NATIVE_DOMAINS = None

def load_native_domains():
    global _NATIVE_DOMAINS
    if _NATIVE_DOMAINS is not None:
        return
    _NATIVE_DOMAINS = {}
    nd_path = Path("go/wrp/ccnf-ref/.tools/native_domains.json")
    if nd_path.exists():
        try:
            nd = json.loads(nd_path.read_text())
            for prefix, tokens in nd.get("native_domains", {}).items():
                _NATIVE_DOMAINS[prefix] = tokens
        except (json.JSONDecodeError, PermissionError):
            pass


def get_native_tokens_for_path(path: str):
    p = path.lstrip("./")
    for prefix, tokens in _NATIVE_DOMAINS.items():
        if p.startswith(prefix) or ("/" + prefix) in p:
            return set(tokens)
    return set()


def get_cir4_keys(mode):
    if mode in ("AUTHORITATIVE", "STATEFUL"):
        return RUNTIME_STATE_KEYS + SCHEMA_STATE_KEYS
    if mode == "DERIVATIONAL":
        return SCHEMA_STATE_KEYS
    return []


# ─── Sentinel to prevent re-processing ───────────────────────────────────────

def _is_quarantined(obj):
    if not isinstance(obj, dict):
        return False
    s = obj.get("status")
    return isinstance(s, str) and (s.startswith("quarantined_CIR") or s.startswith("blocked_by_CIR"))


# ─── CIR-1: Remove phantom references ────────────────────────────────────────

def patch_cir1(obj, mode, domain):
    level = CIR_APPLY.get((domain, mode, 1))
    if level is None:
        return obj
    if _is_quarantined(obj):
        return obj
    if isinstance(obj, dict):
        if "intent_source" in obj:
            v = obj["intent_source"]
            if isinstance(v, str) and "nexus/.conduit-data/" in v:
                obj.pop("intent_source")
                if obj.get("mode") == "execute":
                    obj["mode"] = "legacy"
                    obj["status"] = "aspirational"
                    obj["note"] = "CIR-1: removed unresolvable intent_source"
        for k in list(obj.keys()):
            obj[k] = patch_cir1(obj[k], mode, domain)
    elif isinstance(obj, list):
        return [patch_cir1(x, mode, domain) for x in obj]
    return obj


# ─── CIR-2: Quarantine cross-layer leakage ───────────────────────────────────

def patch_cir2(obj, mode, domain, path_str=""):
    level = CIR_APPLY.get((domain, mode, 2))
    if level is None:
        return obj
    if _is_quarantined(obj):
        return obj

    native = set()
    if level == "STRICT_NATIVE":
        native = get_native_tokens_for_path(path_str)
    effective = [t for t in FORBIDDEN_CROSS_LAYER_TOKENS if t not in native]

    if isinstance(obj, dict):
        for k in list(obj.keys()):
            v = obj[k]
            if isinstance(v, str):
                for token in effective:
                    if token in v:
                        obj[k] = {
                            "status": "blocked_by_CIR2",
                            "reason": "cross_layer_reference_detected",
                            "original": v,
                        }
                        break
            elif not _is_quarantined(v):
                obj[k] = patch_cir2(v, mode, domain, path_str)
    elif isinstance(obj, list):
        return [patch_cir2(x, mode, domain, path_str) for x in obj]
    return obj


# ─── CIR-3: Quarantine implicit execution semantics ─────────────────────────

def patch_cir3(obj, mode, domain):
    level = CIR_APPLY.get((domain, mode, 3))
    if level is None:
        return obj
    if _is_quarantined(obj):
        return obj
    if isinstance(obj, dict):
        if "execution_contract" not in obj:
            for k in list(obj.keys()):
                if k in EXECUTION_IMPLYING_FIELDS:
                    v = obj[k]
                    if not _is_quarantined(v):
                        obj[k] = {
                            "status": "quarantined_CIR3",
                            "reason": "missing_execution_contract",
                            "original": v,
                        }
        for k in obj:
            v = obj[k]
            if not _is_quarantined(v):
                obj[k] = patch_cir3(v, mode, domain)
    elif isinstance(obj, list):
        return [patch_cir3(x, mode, domain) for x in obj]
    return obj


# ─── CIR-4: Quarantine static derived state ─────────────────────────────────

def patch_cir4(obj, mode, domain):
    level = CIR_APPLY.get((domain, mode, 4))
    if level is None:
        return obj
    if _is_quarantined(obj):
        return obj
    cir4_keys = get_cir4_keys(mode)
    if not cir4_keys:
        return obj

    if isinstance(obj, dict):
        for k in list(obj.keys()):
            if k in cir4_keys:
                if not ("derived_by" in obj or "event_log" in obj or "replay" in obj):
                    v = obj[k]
                    if not _is_quarantined(v):
                        obj[k] = {
                            "status": "quarantined_CIR4",
                            "reason": "non_replayable_derived_state",
                            "original": v,
                        }
        for k in obj:
            v = obj[k]
            if not _is_quarantined(v):
                obj[k] = patch_cir4(v, mode, domain)
    elif isinstance(obj, list):
        return [patch_cir4(x, mode, domain) for x in obj]
    return obj


# ─── CIR-5: Quarantine duplicate semantic authority ─────────────────────────

def _cir5_collect(obj, path, index, mode, domain):
    level = CIR_APPLY.get((domain, mode, 5))
    if level is None or level == "MINIMAL" or level == "LIMITED":
        return
    if _is_quarantined(obj):
        return
    fpath = str(path)
    if isinstance(obj, dict):
        for k, v in obj.items():
            if _is_quarantined(v):
                continue
            for cls, keys in SEMANTIC_CLASSES.items():
                if k in keys:
                    index.setdefault(cls, []).append({
                        "path": fpath,
                        "key": k,
                        "value": v,
                    })
            _cir5_collect(v, path, index, mode, domain)
    elif isinstance(obj, list):
        for v in obj:
            _cir5_collect(v, path, index, mode, domain)


def _cir5_find_duplicates(index):
    seen_first = {}
    duplicates = set()
    for cls in sorted(index.keys()):
        for occ in index[cls]:
            pk = (cls, occ["key"])
            if pk in seen_first:
                duplicates.add((occ["path"], occ["key"]))
            else:
                seen_first[pk] = True
    return duplicates


def patch_cir5(obj, path, duplicates_set, mode, domain):
    level = CIR_APPLY.get((domain, mode, 5))
    if level is None or level == "MINIMAL" or level == "LIMITED":
        return obj
    if _is_quarantined(obj):
        return obj
    if isinstance(obj, dict):
        for k in list(obj.keys()):
            v = obj[k]
            for cls, keys in SEMANTIC_CLASSES.items():
                if k in keys and (str(path), k) in duplicates_set:
                    if not _is_quarantined(v):
                        obj[k] = {
                            "status": "quarantined_CIR5",
                            "reason": "dual_authority_detected",
                            "semantic_class": cls,
                            "original": v,
                        }
            if not _is_quarantined(v):
                obj[k] = patch_cir5(v, path, duplicates_set, mode, domain)
    elif isinstance(obj, list):
        return [patch_cir5(x, path, duplicates_set, mode, domain) for x in obj]
    return obj


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    import sys
    apply_changes = "--apply" in sys.argv
    dry_run = not apply_changes

    load_native_domains()

    # ── Pass 0: CIR-5 cross-file index (scope-aware) ─────────────────────────
    cir5_index = {}
    all_json_paths = []
    for p in sorted(Path(".").rglob("*.json")):
        try:
            data = json.loads(p.read_text())
        except (json.JSONDecodeError, PermissionError):
            continue
        all_json_paths.append((p, data))
        domain, subtype = classify(str(p))
        mode = resolve_mode(domain, subtype)
        _cir5_collect(data, p, cir5_index, mode, domain)

    cir5_duplicates = _cir5_find_duplicates(cir5_index)

    # ── Pass 1: Apply patches ────────────────────────────────────────────────
    patched_any = False

    for p, data in all_json_paths:
        original = json.dumps(data, indent=2, sort_keys=False)
        domain, subtype = classify(str(p))
        mode = resolve_mode(domain, subtype)
        path_str = str(p)

        data = patch_cir1(data, mode, domain)
        data = patch_cir2(data, mode, domain, path_str)
        data = patch_cir3(data, mode, domain)
        data = patch_cir4(data, mode, domain)
        data = patch_cir5(data, p, cir5_duplicates, mode, domain)

        patched = json.dumps(data, indent=2, sort_keys=False)

        if patched != original:
            if apply_changes:
                p.write_text(patched + "\n")
                print(f"[patched] {p}")
            else:
                import difflib
                diff = difflib.unified_diff(
                    original.splitlines(),
                    patched.splitlines(),
                    fromfile=str(p),
                    tofile=str(p),
                    lineterm="",
                )
                print(f"\n[diff] {p}")
                for line in diff:
                    print(line)
            patched_any = True

    if not patched_any:
        print("[CIR] No patches applied — all configs clean")


if __name__ == "__main__":
    main()
