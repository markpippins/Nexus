#!/usr/bin/env python3
"""
CIR Ontology Lint Engine — CIR-1 through CIR-5 with CIR-SDM.

Combined structural invariant gate for configuration ontology integrity.
Uses CIR Semantic Domain Model (CIR-SDM) to scope enforcement by
artifact semantic domain and interpretation mode.

Usage:
    python tools/cir1/lint.py                     # CIR-1 only (default)
    python tools/cir1/lint.py --cir2               # CIR-1 + CIR-2
    python tools/cir1/lint.py --cir3               # CIR-1 + CIR-3
    python tools/cir1/lint.py --cir4               # CIR-1 + CIR-4
    python tools/cir1/lint.py --cir5               # CIR-1 + CIR-5
    python tools/cir1/lint.py --strict             # CIR-1 blocking (exit 1 on violation)
    python tools/cir1/lint.py --strict --cir2|--cir3|--cir4|--cir5

Exit codes:
    0 — all checks pass
    1 — violations found in strict mode
"""

import json
import sys
from pathlib import Path

# ─── CIR-1: Phantom references ───────────────────────────────────────────────

# ─── CIR-2: Cross-layer leakage ──────────────────────────────────────────────

FORBIDDEN_CROSS_LAYER_TOKENS = [
    "CEGL", "CER", "CCNF", "ExecutionRequest", "ExecutionState",
    "ADR-", "I1", "I2", "I3", "I4", "I5", "snapshot", "event fold",
]

# ─── CIR-3: Implicit execution semantics ─────────────────────────────────────

EXECUTION_IMPLYING_FIELDS = [
    "mode", "retry_policy", "on_failure", "timeout",
    "backoff", "executor", "execution_state", "dispatch",
]

# ─── CIR-4: Static derived state ─────────────────────────────────────────────
# Split into runtime-state keys (derived truth) vs schema-state keys (structural)

RUNTIME_STATE_KEYS = [
    "status", "state", "result", "decision",
]

SCHEMA_STATE_KEYS = [
    "execution_state", "current_run", "snapshot", "score",
]

# ─── CIR-5: Single Canonical Authority Rule ──────────────────────────────────

SEMANTIC_CLASSES = {
    "execution_state": ["execution_state", "mode", "state"],
    "pipeline_intent": ["intent_source", "PIPELINE_INTENT"],
    "decision": ["decision", "result", "score"],
    "runtime_snapshot": ["snapshot", "snapshot_ref"],
    "execution_status": ["status", "current_run"],
}

# ─── CIR-SDM: Semantic Domain Model ─────────────────────────────────────────

# Domain classification (first match wins, priority order)
def classify(path: str):
    """Returns (domain, subtype_or_none).

    Priority: BUILD > SCHEMA > DATA > GOVERNANCE > RUNTIME > DATA(fallback)
    """
    p = path.lstrip("./")

    # 1. BUILD — fastest exclusion
    if any(x in p for x in [
        "node_modules", "__pycache__", ".git",
        "package-lock.json", "package.json",
        "/build/", "/target/", "/.angular/", "/.cache/",
    ]):
        return ("BUILD", None)

    # 2. SCHEMA — structural descriptors
    if p.endswith(".schema.json") or "/schema/" in p:
        return ("SCHEMA", None)

    # 3. DATA — vectors, tests, logs, samples (always before governance
    #    to prevent go/wrp/ccnf-ref/vectors/ being absorbed into CANONICAL)
    if any(x in p for x in ["/vectors/", "/tests/", "/logs/", "/samples/", "/specimens/"]):
        return ("DATA", None)

    # 4. GOVERNANCE — subtyped (STATEFUL before CCNF catch-all)
    if "pgv.state_machine" in p:
        return ("GOVERNANCE", "CANONICAL")
    if "transition_ledger" in p:
        return ("GOVERNANCE", "STATEFUL")
    if p.startswith("go/wrp/ccnf-ref/") and not any(x in p for x in ["/vectors/", "/tests/"]):
        return ("GOVERNANCE", "CANONICAL")
    if p.startswith(".agent/"):
        return ("GOVERNANCE", "ASPIRATIONAL")
    if p.startswith(".tools/") or p.startswith(".github/"):
        return ("GOVERNANCE", "CANONICAL")

    # 5. RUNTIME — live execution
    if "/runtime/" in p or "/executor/" in p:
        return ("RUNTIME", None)

    # 6. DATA — fallback
    return ("DATA", None)


# Interpretation modes
SUBTYPE_MODE = {
    "CANONICAL":    "AUTHORITATIVE",
    "ASPIRATIONAL": "STRUCTURAL",
    "STATEFUL":     "DERIVATIONAL",
}

DOMAIN_MODE = {
    "GOVERNANCE":    None,  # must use subtype
    "RUNTIME":       "STATEFUL",
    "SCHEMA":        "STRUCTURAL",
    "DATA":          "STRUCTURAL",
    "BUILD":         "STRUCTURAL",
}


def resolve_mode(domain, subtype):
    if domain == "GOVERNANCE":
        return SUBTYPE_MODE[subtype]
    return DOMAIN_MODE[domain]


# CIR execution matrix: (domain, mode, rule_number) → level or None
# None = rule is skipped entirely for this domain/mode
CIR_APPLY = {
    # GOV:CANONICAL — AUTHORITATIVE
    ("GOVERNANCE", "AUTHORITATIVE", 1): "STRICT",
    ("GOVERNANCE", "AUTHORITATIVE", 2): "STRICT_NATIVE",
    ("GOVERNANCE", "AUTHORITATIVE", 3): "STRICT",
    ("GOVERNANCE", "AUTHORITATIVE", 4): "STRICT",
    ("GOVERNANCE", "AUTHORITATIVE", 5): "STRICT",
    # GOV:ASPIRATIONAL — STRUCTURAL
    ("GOVERNANCE", "STRUCTURAL", 1): "STRICT",
    ("GOVERNANCE", "STRUCTURAL", 2): "STRICT",
    ("GOVERNANCE", "STRUCTURAL", 3): None,
    ("GOVERNANCE", "STRUCTURAL", 4): None,
    ("GOVERNANCE", "STRUCTURAL", 5): "STRICT",
    # GOV:STATEFUL — DERIVATIONAL
    ("GOVERNANCE", "DERIVATIONAL", 1): "STRICT",
    ("GOVERNANCE", "DERIVATIONAL", 2): "STRICT",
    ("GOVERNANCE", "DERIVATIONAL", 3): None,
    ("GOVERNANCE", "DERIVATIONAL", 4): "SCHEMA",
    ("GOVERNANCE", "DERIVATIONAL", 5): "STRICT",
    # RUNTIME — STATEFUL
    ("RUNTIME", "STATEFUL", 1): "STRICT",
    ("RUNTIME", "STATEFUL", 2): None,
    ("RUNTIME", "STATEFUL", 3): "STRICT",
    ("RUNTIME", "STATEFUL", 4): "STRICT",
    ("RUNTIME", "STATEFUL", 5): "STRICT",
    # SCHEMA — STRUCTURAL
    ("SCHEMA", "STRUCTURAL", 1): "STRICT",
    ("SCHEMA", "STRUCTURAL", 2): None,
    ("SCHEMA", "STRUCTURAL", 3): None,
    ("SCHEMA", "STRUCTURAL", 4): None,
    ("SCHEMA", "STRUCTURAL", 5): "LIMITED",
    # DATA — STRUCTURAL
    ("DATA", "STRUCTURAL", 1): "MINIMAL",
    ("DATA", "STRUCTURAL", 2): None,
    ("DATA", "STRUCTURAL", 3): None,
    ("DATA", "STRUCTURAL", 4): None,
    ("DATA", "STRUCTURAL", 5): None,
    # BUILD — STRUCTURAL
    ("BUILD", "STRUCTURAL", 1): "MINIMAL",
    ("BUILD", "STRUCTURAL", 2): None,
    ("BUILD", "STRUCTURAL", 3): None,
    ("BUILD", "STRUCTURAL", 4): None,
    ("BUILD", "STRUCTURAL", 5): None,
}


# Native domains loaded from governance config
_NATIVE_DOMAINS = None

def load_native_domains():
    global _NATIVE_DOMAINS
    if _NATIVE_DOMAINS is not None:
        return
    _NATIVE_DOMAINS = {}  # prefix → list of tokens
    nd_path = Path("go/wrp/ccnf-ref/.tools/native_domains.json")
    if nd_path.exists():
        try:
            nd = json.loads(nd_path.read_text())
            for prefix, tokens in nd.get("native_domains", {}).items():
                _NATIVE_DOMAINS[prefix] = tokens
        except (json.JSONDecodeError, PermissionError):
            pass


def get_native_tokens_for_path(path: str):
    """Return set of tokens native to this path's domain."""
    p = path.lstrip("./")
    for prefix, tokens in _NATIVE_DOMAINS.items():
        if p.startswith(prefix) or ("/" + prefix) in p:
            return set(tokens)
    return set()


# CIR-4 key selection per mode
def get_cir4_keys(mode):
    if mode in ("AUTHORITATIVE", "STATEFUL"):
        return RUNTIME_STATE_KEYS + SCHEMA_STATE_KEYS
    if mode == "DERIVATIONAL":
        return SCHEMA_STATE_KEYS  # schema-mode only
    return []


# ─── Sentinel: skip already-quarantined values ───────────────────────────────

def _is_quarantined(obj):
    if not isinstance(obj, dict):
        return False
    s = obj.get("status")
    return isinstance(s, str) and (s.startswith("quarantined_CIR") or s.startswith("blocked_by_CIR"))


# ─── CIR-1 check ─────────────────────────────────────────────────────────────

def check_cir1(path, obj, violations, mode, domain):
    level = CIR_APPLY.get((domain, mode, 1))
    if level is None:
        return
    if _is_quarantined(obj):
        return
    if isinstance(obj, dict):
        if "intent_source" in obj:
            v = obj["intent_source"]
            if isinstance(v, str) and "nexus/.conduit-data/" in v:
                violations.append((str(path), "CIR-1", "PIPELINE_PHANTOM", v))
        for k, v in obj.items():
            check_cir1(path, v, violations, mode, domain)
    elif isinstance(obj, list):
        for v in obj:
            check_cir1(path, v, violations, mode, domain)


# ─── CIR-2 check ─────────────────────────────────────────────────────────────

def check_cir2(path, obj, violations, mode, domain):
    level = CIR_APPLY.get((domain, mode, 2))
    if level is None:
        return
    if _is_quarantined(obj):
        return

    # Compute effective forbidden tokens: subtract native tokens for this path
    native = set()
    if level == "STRICT_NATIVE":
        native = get_native_tokens_for_path(str(path))
    effective = [t for t in FORBIDDEN_CROSS_LAYER_TOKENS if t not in native]

    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str):
                for token in effective:
                    if token in v:
                        violations.append(
                            (str(path), "CIR-2", "CROSS_LAYER_LEAK", f"{k}:{v}")
                        )
            check_cir2(path, v, violations, mode, domain)
    elif isinstance(obj, list):
        for v in obj:
            check_cir2(path, v, violations, mode, domain)


# ─── CIR-3 check ─────────────────────────────────────────────────────────────

def check_cir3(path, obj, violations, mode, domain):
    level = CIR_APPLY.get((domain, mode, 3))
    if level is None:
        return
    if _is_quarantined(obj):
        return
    if isinstance(obj, dict):
        has_contract = "execution_contract" in obj
        for k, v in obj.items():
            if k in EXECUTION_IMPLYING_FIELDS:
                if not has_contract and not _is_quarantined(v):
                    violations.append(
                        (str(path), "CIR-3", "MISSING_EXEC_CONTRACT", f"{k}:{v}")
                    )
            check_cir3(path, v, violations, mode, domain)
    elif isinstance(obj, list):
        for v in obj:
            check_cir3(path, v, violations, mode, domain)


# ─── CIR-4 check ─────────────────────────────────────────────────────────────

def check_cir4(path, obj, violations, mode, domain):
    level = CIR_APPLY.get((domain, mode, 4))
    if level is None:
        return
    if _is_quarantined(obj):
        return
    cir4_keys = get_cir4_keys(mode)
    if not cir4_keys:
        return

    if isinstance(obj, dict):
        is_derivable_container = any(
            k in obj for k in ["event_log", "replay", "cer", "ccnf"]
        )
        for k, v in obj.items():
            if k in cir4_keys:
                if not (
                    "derived_by" in obj
                    or "event_log" in obj
                    or "replay" in obj
                ):
                    if not _is_quarantined(v):
                        violations.append(
                            (str(path), "CIR-4", "STATIC_DERIVED_STATE", f"{k}:{v}")
                        )
            check_cir4(path, v, violations, mode, domain)
    elif isinstance(obj, list):
        for v in obj:
            check_cir4(path, v, violations, mode, domain)


# ─── CIR-5: Single Canonical Authority Rule — relational detector ──────────

def collect_semantic_classes(path, obj, index, mode, domain):
    level = CIR_APPLY.get((domain, mode, 5))
    if level is None or level == "MINIMAL":
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
            collect_semantic_classes(path, v, index, mode, domain)
    elif isinstance(obj, list):
        for v in obj:
            collect_semantic_classes(path, v, index, mode, domain)


def check_cir5(index, violations):
    for cls, occurrences in index.items():
        authoritative = []
        for o in occurrences:
            p = o["path"]
            if "cache" not in p and "mirror" not in p \
               and "quarantine" not in p and "CIR" not in p:
                authoritative.append(o)
        if len(authoritative) > 1:
            a0, a1 = authoritative[0], authoritative[1]
            violations.append((
                cls,
                "CIR-5",
                "DUAL_AUTHORITY",
                (
                    f"semantic_class={cls}: "
                    f"first={a0['path']}:{a0['key']}, "
                    f"second={a1['path']}:{a1['key']}"
                ),
            ))


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    load_native_domains()

    active_cirs = {"cir1": True}
    strict = False

    for arg in sys.argv[1:]:
        if arg == "--strict":
            strict = True
        elif arg == "--cir2":
            active_cirs["cir2"] = True
        elif arg == "--cir3":
            active_cirs["cir3"] = True
        elif arg == "--cir4":
            active_cirs["cir4"] = True
        elif arg == "--cir5":
            active_cirs["cir5"] = True
        elif arg == "--all":
            active_cirs.update({"cir1": True, "cir2": True, "cir3": True, "cir4": True, "cir5": True})

    all_violations = []
    cir5_index = {}

    for p in sorted(Path(".").rglob("*.json")):
        try:
            data = json.loads(p.read_text())
        except (json.JSONDecodeError, PermissionError):
            continue

        domain, subtype = classify(str(p))
        mode = resolve_mode(domain, subtype)

        if active_cirs.get("cir1"):
            check_cir1(p, data, all_violations, mode, domain)
        if active_cirs.get("cir2"):
            check_cir2(p, data, all_violations, mode, domain)
        if active_cirs.get("cir3"):
            check_cir3(p, data, all_violations, mode, domain)
        if active_cirs.get("cir4"):
            check_cir4(p, data, all_violations, mode, domain)
        if active_cirs.get("cir5"):
            collect_semantic_classes(p, data, cir5_index, mode, domain)

    # CIR-5 is relational — run after all files are indexed
    if active_cirs.get("cir5"):
        check_cir5(cir5_index, all_violations)

    # Report
    by_rule = {}
    for v in all_violations:
        rule = v[1]
        by_rule.setdefault(rule, []).append(v)

    if by_rule:
        for rule in sorted(by_rule.keys()):
            entries = by_rule[rule]
            print(f"\n[{rule}] ({len(entries)} violations)")
            for entry in entries[:10]:
                if len(entry) == 4:
                    # CIR-5 format: (cls, rule, code, detail)
                    path, r, code, detail = entry
                    print(f"  [{code}]  {detail}")
                else:
                    path, r, code, detail = entry
                    print(f"  {path}  [{code}]  {detail}")
            if len(entries) > 10:
                print(f"  ... and {len(entries) - 10} more")
        print(f"\nTotal: {len(all_violations)} violation(s)")

        if strict:
            active_flags_str = ", ".join(k.upper() for k, v in active_cirs.items() if v)
            print(f"\nCIR-1: BLOCKED — violations found in strict mode ({active_flags_str})")
            sys.exit(1)
    else:
        active_flags = [k.upper() for k, v in active_cirs.items() if v]
        print(f"CIR-1 OK ({', '.join(active_flags)}): no violations")

    sys.exit(0)


if __name__ == "__main__":
    main()
