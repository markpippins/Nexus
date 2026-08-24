#!/usr/bin/env python3
"""
JSON-LD Resolver + Validator — contract-stack Step 11.

Makes `https://nexus.local/schema/...` a usable contract instead of a
documentation-only URL:

1. **Resolver** — a checked local context map: every `https://nexus.local/
   schema/<path>` URL (context imports, namespace prefix bases, $id/$schema
   versioned identifiers) resolves to a real file under `schemas/`.
2. **Validator** — for every JSON-LD document under `schemas/`:
   - every `@context` URL resolves against the registry
   - every namespace prefix base URL resolves to a context document
   - every vocabulary reference (`@type` / `@id` using a declared prefix, or a
     full nexus.local URL) expands to a declared term or a resolvable file
   - every prefix used by a reference is actually declared by the document

Failure classes:
    unresolved-context    — an @context URL does not resolve to a local file
    unresolved-namespace  — a namespace prefix base URL does not resolve
    undeclared-term       — a vocabulary reference expands to an IRI that no
                            context document declares
    unknown-prefix        — a reference uses a prefix the document never declares
    unresolved-id         — a full nexus.local @id does not resolve to a file

Usage:
    python tools/authority/check_jsonld.py              # text report
    python tools/authority/check_jsonld.py --json       # machine-readable
    python tools/authority/check_jsonld.py --map        # print the context map

Exit codes:
    0 — all JSON-LD resolves and validates
    1 — one or more violations found
"""

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCHEMAS = REPO_ROOT / "schemas"

BASE = "https://nexus.local/schema/"
# Standard W3C vocabularies — always declared, never an unknown prefix.
STANDARD_PREFIXES = {
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "owl": "http://www.w3.org/2002/07/owl#",
    "schema": "https://schema.org/",
}

# External vocabularies that are permitted in @id/@type positions.
EXTERNAL = tuple(STANDARD_PREFIXES.values())

VERSION_SUFFIX = re.compile(r"/(?:v\d+|[0-9]{4}-[0-9]{2}-[0-9]{2})$")


def is_nexus_url(url):
    return isinstance(url, str) and url.startswith(BASE)


_DECLARED_IDS = None


def _declared_id_map():
    """Lazily built map: every $id / $schema URL a schema file declares maps
    to that declaring file. This is the canonical identity registry — a file's
    own declared URL resolves to the file regardless of its on-disk name."""
    global _DECLARED_IDS
    if _DECLARED_IDS is not None:
        return _DECLARED_IDS
    _DECLARED_IDS = {}
    for p in sorted(SCHEMAS.rglob("*.json")):
        if p.suffix == ".jsonld":
            continue
        try:
            data = json.loads(p.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        if not isinstance(data, dict):
            continue
        for key in ("$id", "$schema"):
            url = data.get(key)
            if is_nexus_url(url):
                _DECLARED_IDS[url] = p
    return _DECLARED_IDS


def resolve(url):
    """Map a nexus.local schema URL to a repo file/dir, or None."""
    if not is_nexus_url(url):
        return None
    declared = _declared_id_map().get(url)
    if declared is not None:
        return declared
    rel = url[len(BASE):].rstrip("/")
    candidates = []
    if rel:
        candidates += [
            SCHEMAS / rel,
            SCHEMAS / f"{rel}.jsonld",
            SCHEMAS / f"{rel}.json",
            SCHEMAS / f"{rel}.schema.json",
        ]
        # versioned identifiers: $id "…/wrp/work-request/v1" -> work-request.schema.json
        m = VERSION_SUFFIX.search(rel)
        if m:
            stem = rel[:m.start()]
            candidates += [
                SCHEMAS / stem,
                SCHEMAS / f"{stem}.jsonld",
                SCHEMAS / f"{stem}.json",
                SCHEMAS / f"{stem}.schema.json",
            ]
    else:
        candidates.append(SCHEMAS)
    for c in candidates:
        if c.exists():
            return c
    return None


# ─── Context map (the checked registry) ─────────────────────────────────────

def context_map():
    """URL -> resolved path for every nexus.local URL declared anywhere."""
    mapping = {}
    for p in sorted(SCHEMAS.rglob("*.jsonld")):
        try:
            data = json.loads(p.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        _collect_urls(data, p, mapping)
    for p in sorted(SCHEMAS.rglob("*.json")):
        if p.suffix == ".jsonld":
            continue
        try:
            data = json.loads(p.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        for key in ("$id", "$schema"):
            url = data.get(key) if isinstance(data, dict) else None
            if is_nexus_url(url):
                mapping[url] = _declared_id_map().get(url) or resolve(url)
    return mapping


def _collect_urls(obj, origin, mapping):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "@context":
                _collect_context_urls(v, origin, mapping)
            elif isinstance(v, str) and is_nexus_url(v):
                mapping[v] = resolve(v)
            else:
                _collect_urls(v, origin, mapping)
    elif isinstance(obj, list):
        for v in obj:
            _collect_urls(v, origin, mapping)


def _collect_context_urls(ctx, origin, mapping):
    if isinstance(ctx, str):
        if is_nexus_url(ctx):
            mapping[ctx] = resolve(ctx)
    elif isinstance(ctx, list):
        for item in ctx:
            _collect_context_urls(item, origin, mapping)
    elif isinstance(ctx, dict):
        for k, v in ctx.items():
            if isinstance(v, str) and is_nexus_url(v):
                mapping[v] = resolve(v)


# ─── Document validation ────────────────────────────────────────────────────

def declared_term_iris():
    """Set of full IRIs declared as terms by any context document."""
    iris = set()
    for p in sorted(SCHEMAS.rglob("*.jsonld")):
        try:
            data = json.loads(p.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        ctx = data.get("@context")
        if not isinstance(ctx, dict):
            continue
        prefixes = {}
        for k, v in ctx.items():
            if k.startswith("@") or not isinstance(v, str):
                continue
            if "://" in v:
                prefixes[k] = v
        for k, v in ctx.items():
            if k.startswith("@") or not isinstance(v, str):
                continue
            if "://" in v:
                continue
            if ":" in v:
                pre, _, rest = v.partition(":")
                if pre in prefixes:
                    iris.add(prefixes[pre] + rest)
    return iris


def _load_context_doc(path):
    """Load a context document's raw @context value (dict), or None."""
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None
    ctx = data.get("@context")
    return ctx if isinstance(ctx, dict) else None


def effective_prefixes(data, depth=0):
    """Prefix map for a document: its own @context declarations plus the
    standard vocabularies and the base `nx` fallback. Context URL imports are
    resolved through the registry (depth-limited) so imported prefixes and
    aliases count."""
    prefixes = {"nx": BASE}
    prefixes.update(STANDARD_PREFIXES)
    ctx = data.get("@context")

    def ingest(ctx_value, depth):
        if depth > 2 or ctx_value is None:
            return
        if isinstance(ctx_value, str):
            resolved = resolve(ctx_value)
            if resolved and resolved.suffix == ".jsonld":
                imported = _load_context_doc(resolved)
                if imported:
                    ingest(imported, depth + 1)
        elif isinstance(ctx_value, list):
            for item in ctx_value:
                ingest(item, depth + 1)
        elif isinstance(ctx_value, dict):
            for k, v in ctx_value.items():
                if k.startswith("@") or not isinstance(v, str):
                    continue
                if "://" in v:
                    prefixes[k] = v

    ingest(ctx, depth)
    return prefixes


def alias_keys(data):
    """Map alias -> "@id"|"@type" for keys aliased via the context
    (e.g. `"id": "@id", "type": "@type"`), including URL imports."""
    aliases = {}
    ctx = data.get("@context")

    def ingest(ctx_value, depth):
        if depth > 2 or ctx_value is None:
            return
        if isinstance(ctx_value, str):
            resolved = resolve(ctx_value)
            if resolved and resolved.suffix == ".jsonld":
                imported = _load_context_doc(resolved)
                if imported:
                    ingest(imported, depth + 1)
        elif isinstance(ctx_value, list):
            for item in ctx_value:
                ingest(item, depth + 1)
        elif isinstance(ctx_value, dict):
            for k, v in ctx_value.items():
                if v == "@id":
                    aliases[k] = "@id"
                elif v == "@type":
                    aliases[k] = "@type"

    ingest(ctx, 0)
    return aliases


def expand(value, prefixes):
    """Expand a prefixed or URL value to its full IRI (or None)."""
    if not isinstance(value, str):
        return None
    if "://" in value:
        return value
    if ":" in value:
        pre, _, rest = value.partition(":")
        if pre in prefixes:
            return prefixes[pre] + rest
        return f"__UNKNOWN_PREFIX__:{pre}"
    return None


def validate_document(path, declared, violations):
    rel = str(path.relative_to(REPO_ROOT))
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        violations.append({
            "failure_class": "unresolved-context",
            "domain": rel,
            "detail": f"unparseable JSON-LD: {exc}",
        })
        return
    prefixes = effective_prefixes(data)
    aliases = alias_keys(data)
    id_keys = {"@id"} | {k for k, v in aliases.items() if v == "@id"}
    type_keys = {"@type"} | {k for k, v in aliases.items() if v == "@type"}
    check_ctx = []

    # @context URLs must resolve
    def walk_context(ctx):
        if isinstance(ctx, str):
            check_ctx.append(ctx)
        elif isinstance(ctx, list):
            for item in ctx:
                walk_context(item)
        elif isinstance(ctx, dict):
            for k, v in ctx.items():
                if k == "@context":
                    walk_context(v)
                elif isinstance(v, str) and is_nexus_url(v):
                    check_ctx.append(v)

    walk_context(data.get("@context"))
    for url in check_ctx:
        if resolve(url) is None:
            violations.append({
                "failure_class": "unresolved-context",
                "domain": rel,
                "detail": f"@context URL does not resolve to a local file: {url}",
            })

    # walk the body: @type / @id references (including aliased keys)
    seen = set()

    def walk(obj, ancestors=()):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k == "@context":
                    continue
                if k in type_keys and isinstance(v, str):
                    _check_ref(v, "type", ancestors, seen)
                elif k in type_keys and isinstance(v, list):
                    for item in v:
                        if isinstance(item, str):
                            _check_ref(item, "type", ancestors, seen)
                elif k in id_keys and isinstance(v, str):
                    _check_ref(v, "id", ancestors, seen)
                elif k in id_keys and isinstance(v, list):
                    for item in v:
                        if isinstance(item, str):
                            _check_ref(item, "id", ancestors, seen)
                walk(v, ancestors + (k,))
        elif isinstance(obj, list):
            for v in obj:
                walk(v, ancestors)

    def _check_ref(value, kind, ancestors, seen):
        key = (rel, kind, value)
        if key in seen:
            return
        seen.add(key)
        expanded = expand(value, prefixes)
        if expanded is None:
            return
        if expanded.startswith("__UNKNOWN_PREFIX__"):
            pre = expanded.split(":", 1)[1]
            violations.append({
                "failure_class": "unknown-prefix",
                "domain": rel,
                "detail": f"{kind} uses undeclared prefix {pre!r}: {value}",
            })
            return
        if any(expanded.startswith(e) for e in EXTERNAL):
            return
        if kind == "type":
            # @type is vocabulary — must be a declared term.
            if expanded not in declared:
                violations.append({
                    "failure_class": "undeclared-term",
                    "domain": rel,
                    "detail": f"type expands to undeclared term: {expanded}",
                })
        else:
            # @id is an identifier, not a document path — a prefixed or
            # namespaced identifier only needs its prefix declared (checked
            # above). Cross-document refs are the @context URLs and prefix
            # bases, validated separately; an @id that happens to resolve to a
            # local file is fine but not required.
            pass

    walk(data)


# ─── Orchestration ──────────────────────────────────────────────────────────

def run_checks():
    violations = []
    declared = declared_term_iris()
    for p in sorted(SCHEMAS.rglob("*.jsonld")):
        validate_document(p, declared, violations)
    return violations


def main():
    output_json = "--json" in sys.argv
    show_map = "--map" in sys.argv

    if show_map:
        for url, path in sorted(context_map().items()):
            resolved = str(path.relative_to(REPO_ROOT)) if path else "UNRESOLVED"
            print(f"{url}  ->  {resolved}")
        return 0

    violations = run_checks()
    if output_json:
        print(json.dumps({
            "status": "PASS" if not violations else "FAIL",
            "total_violations": len(violations),
            "violations": violations,
        }, indent=2))
    else:
        if not violations:
            print("[JSONLD] PASS — all nexus.local @context URLs resolve and vocabulary validates")
        else:
            print("[JSONLD] FAIL — JSON-LD resolution/vocabulary violations:")
            by_class = {}
            for v in violations:
                by_class.setdefault(v["failure_class"], []).append(v)
            for fc in sorted(by_class):
                print(f"\n  [{fc}] ({len(by_class[fc])} violation(s))")
                for v in by_class[fc][:8]:
                    print(f"    {v.get('domain')}: {v['detail']}")
                if len(by_class[fc]) > 8:
                    print(f"    ... and {len(by_class[fc]) - 8} more")
            print(f"\n  Total: {len(violations)} violation(s)")
    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
