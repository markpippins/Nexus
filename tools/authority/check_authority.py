#!/usr/bin/env python3
"""
Authority Matrix Validator — single-canonical-authority enforcement.

Reads schemas/authority/authority-matrix.json (data) and verifies that every
semantic domain has exactly one authoritative artifact on disk, that no
semantic class is claimed by two authoritative files, and that every declared
projection resolves to a real file (or is listed when it lives in the
projections directory).

This is the data-driven successor to the CIR-5 key-aliasing in
tools/cir1/lint.py: instead of a hard-coded SEMANTIC_CLASSES map with coarse
key aliases, the matrix declares, per domain, the canonical authority and its
superseded/projected forms, and the validator enforces single authority from
that declaration.

Usage:
    python tools/authority/check_authority.py            # report, exit 1 on violation
    python tools/authority/check_authority.py --json     # structured JSON output
    python tools/authority/check_authority.py --strict   # same (always blocking)

Exit codes:
    0 — all checks pass
    1 — one or more violations found

Failure classes:
    no-authority         — a matrix domain has no resolvable canonical authority
    duplicate-class      — a semantic class is claimed by >1 authoritative file
    unlisted-projection  — a declared projection does not exist, a file in
                           schemas/projections/ is undeclared, or the projection
                           manifest sources from a projection/superseded artifact
    projection-drift     — an active projection's output is missing, its committed
                           digest no longer matches the on-disk artifact, or a
                           regenerate-mode generator fails / produces no output /
                           produces content that diverges from the committed digest
"""

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MATRIX_PATH = REPO_ROOT / "schemas" / "authority" / "authority-matrix.json"
PROJECTIONS_DIR = REPO_ROOT / "schemas" / "projections"
PROJECTION_MANIFEST = PROJECTIONS_DIR / "projection-manifest.jsonld"

# ─── Path helpers ────────────────────────────────────────────────────────────

def normalize(p):
    """Strip a leading ./ or nexus/ prefix and surrounding whitespace for
    stable comparison. The redundant `nexus/` prefix appears in older manifests
    only; repo-relative paths never carry it."""
    s = str(p).strip()
    while s.startswith("./"):
        s = s[2:]
    if s.startswith("nexus/"):
        s = s[len("nexus/"):]
    return s


def path_exists(rel):
    return (REPO_ROOT / normalize(rel)).exists()


def file_digest(rel, algorithm="sha256"):
    """Recompute the digest of a repo-relative file. Returns None on failure."""
    try:
        h = hashlib.new(algorithm)
        with open(REPO_ROOT / normalize(rel), "rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except (OSError, ValueError):
        return None


def run_generator(command, timeout=300):
    """Run a projection generator command from the repo root.

    Returns (ok, detail): ok is False on non-zero exit, timeout, or failure to
    spawn; detail carries the exit code and a tail of the captured output so
    the failure surfaces in the validator report."""
    try:
        proc = subprocess.run(
            command,
            shell=True,
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return False, f"generator timed out after {timeout}s"
    except OSError as exc:
        return False, f"could not start generator: {exc}"
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-5:]
        return False, f"exit {proc.returncode}: " + " | ".join(tail)
    return True, ""


# ─── CIR-SDM classification (mirrors tools/cir1/lint.py) ────────────────────

def classify(path):
    p = normalize(path)
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
    "CANONICAL": "AUTHORITATIVE",
    "ASPIRATIONAL": "STRUCTURAL",
    "STATEFUL": "DERIVATIONAL",
}
DOMAIN_MODE = {
    "GOVERNANCE": None,
    "RUNTIME": "STATEFUL",
    "SCHEMA": "STRUCTURAL",
    "DATA": "STRUCTURAL",
    "BUILD": "STRUCTURAL",
}


def resolve_mode(domain, subtype):
    if domain == "GOVERNANCE":
        return SUBTYPE_MODE[subtype]
    return DOMAIN_MODE[domain]


# CIR-5 apply matrix — a semantic class is collected only for these scopes
CIR5_APPLY = {
    ("GOVERNANCE", "AUTHORITATIVE"): "STRICT",
    ("GOVERNANCE", "STRUCTURAL"): "STRICT",
    ("GOVERNANCE", "DERIVATIONAL"): "STRICT",
    ("RUNTIME", "STATEFUL"): "STRICT",
    ("SCHEMA", "STRUCTURAL"): "LIMITED",
    ("DATA", "STRUCTURAL"): None,
    ("BUILD", "STRUCTURAL"): None,
}


def _is_quarantined(obj):
    if not isinstance(obj, dict):
        return False
    s = obj.get("status")
    return isinstance(s, str) and (s.startswith("quarantined_CIR") or s.startswith("blocked_by_CIR"))


# ─── Loading ────────────────────────────────────────────────────────────────

def load_matrix(path=MATRIX_PATH):
    with open(path) as fh:
        return json.load(fh)


def iter_json_files():
    for p in sorted(REPO_ROOT.rglob("*.json")):
        yield p


# ─── Semantic-class index (mirrors CIR-5 collect, data-driven keys) ─────────

def _semantic_key_matches(key, ancestors, class_keys):
    """Qualified-key matching: a class key like `metadata.mode` matches the
    bare key `mode` only when `metadata` is among its ancestors. Bare class
    keys match the bare key directly. Disambiguates the overloaded `mode` key
    (pipeline `mode: execute` vs the IR-layer `metadata.mode`)."""
    for ck in class_keys:
        if "." in ck:
            head, tail = ck.split(".", 1)
            if tail == key and head in ancestors:
                return True
        elif ck == key:
            return True
    return False


def collect_semantic_classes(matrix, files):
    """Return {semantic_class: [(rel_path, key), ...]} for all scoped, non-quarantined files."""
    keys_by_class = matrix.get("semantic_class_keys", {})
    index = {}
    for p in files:
        try:
            data = json.loads(p.read_text())
        except (json.JSONDecodeError, PermissionError, OSError):
            continue
        rel = normalize(p.relative_to(REPO_ROOT))
        domain, subtype = classify(rel)
        mode = resolve_mode(domain, subtype)
        if CIR5_APPLY.get((domain, mode)) in (None, "MINIMAL"):
            continue

        def walk(obj, ancestors=()):
            if _is_quarantined(obj):
                return
            if isinstance(obj, dict):
                for k, v in obj.items():
                    for cls, keys in keys_by_class.items():
                        if _semantic_key_matches(k, ancestors, keys):
                            index.setdefault(cls, []).append((rel, k))
                    walk(v, ancestors + (k,))
            elif isinstance(obj, list):
                for v in obj:
                    walk(v, ancestors)

        walk(data)
    return index


# ─── Checks ────────────────────────────────────────────────────────────────

def check_registry(matrix):
    """Structural self-consistency of the matrix itself."""
    violations = []
    canonical_by_path = {}
    role_by_path = {}

    authorities = matrix.get("authorities", [])
    seen_domains = set()
    for entry in authorities:
        domain = entry.get("domain")
        canonical = normalize(entry.get("canonical") or "")

        # no-authority: a domain with no resolvable canonical
        if not canonical:
            violations.append({
                "failure_class": "no-authority",
                "domain": domain,
                "detail": "domain has no canonical authority declared",
            })
            continue
        if not path_exists(canonical):
            violations.append({
                "failure_class": "no-authority",
                "domain": domain,
                "detail": f"canonical authority does not exist on disk: {canonical}",
            })

        if domain in seen_domains:
            violations.append({
                "failure_class": "no-authority",
                "domain": domain,
                "detail": "duplicate domain entry in matrix",
            })
        seen_domains.add(domain)

        canonical_by_path.setdefault(canonical, []).append(domain)
        role_by_path.setdefault(canonical, "canonical")

        for p in (entry.get("superseded") or []):
            rp = normalize(p)
            if not path_exists(rp):
                violations.append({
                    "failure_class": "no-authority",
                    "domain": domain,
                    "detail": f"superseded artifact does not exist on disk: {rp}",
                })
            # ambiguous-role: same path canonical in one domain, superseded in another
            if role_by_path.get(rp) == "canonical":
                violations.append({
                    "failure_class": "unlisted-projection",
                    "domain": domain,
                    "detail": f"path is both canonical and superseded: {rp}",
                })
            role_by_path.setdefault(rp, "superseded")

        for p in (entry.get("projections") or []):
            rp = normalize(p)
            if not path_exists(rp):
                violations.append({
                    "failure_class": "unlisted-projection",
                    "domain": domain,
                    "detail": f"projection does not exist on disk: {rp}",
                })
            if role_by_path.get(rp) == "canonical":
                violations.append({
                    "failure_class": "unlisted-projection",
                    "domain": domain,
                    "detail": f"path is both canonical and projection: {rp}",
                })
            role_by_path.setdefault(rp, "projection")

    # duplicate-canonical: two domains claim the same canonical path
    for path, domains in canonical_by_path.items():
        if len(domains) > 1:
            violations.append({
                "failure_class": "no-authority",
                "domain": ", ".join(domains),
                "detail": f"canonical authority claimed by multiple domains: {path}",
            })

    return violations


def superseded_paths(matrix):
    out = set()
    for entry in matrix.get("authorities", []):
        for p in (entry.get("superseded") or []):
            out.add(normalize(p))
    return out


def check_duplicate_class(matrix, index):
    """duplicate-class: a semantic class claimed by >1 authoritative file."""
    violations = []
    superseded = superseded_paths(matrix)
    for cls in sorted(index):
        occurrences = index[cls]
        authoritative = []
        for rel, key in occurrences:
            if rel in superseded:
                continue
            # cache/mirror/quarantine artifacts and point-in-time snapshots are
            # generated projections — never authoritative (snapshot exclusion is
            # the Wave-3 'snapshot as generated projection' rule)
            if any(t in rel for t in ("cache", "mirror", "quarantine", "CIR",
                                      "snapshot", ".bak", ".pre-rebuild")):
                continue
            authoritative.append((rel, key))
        files = sorted(set(rel for rel, _ in authoritative))
        if len(files) > 1:
            violations.append({
                "failure_class": "duplicate-class",
                "semantic_class": cls,
                "detail": "semantic class claimed by multiple authoritative files: "
                          + ", ".join(files),
            })
    return violations


def check_unlisted_projection(matrix):
    """unlisted-projection: files in schemas/projections/ not declared as a projection."""
    violations = []
    declared = set()
    for entry in matrix.get("authorities", []):
        for p in (entry.get("projections") or []):
            declared.add(normalize(p))

    if not PROJECTIONS_DIR.exists():
        return violations

    for p in sorted(PROJECTIONS_DIR.iterdir()):
        if not p.is_file():
            continue
        rel = normalize(p.relative_to(REPO_ROOT))
        if rel == normalize(PROJECTION_MANIFEST.relative_to(REPO_ROOT)):
            continue  # the manifest is the registry, not a projection
        if rel not in declared:
            violations.append({
                "failure_class": "unlisted-projection",
                "domain": "(unlisted)",
                "detail": f"file in schemas/projections/ is not declared as a projection: {rel}",
            })
    return violations


def check_manifest(matrix, manifest=None):
    """unlisted-projection (manifest): a projection or superseded artifact must
    never be used as a manifest sourceSchema — only a canonical authority may
    be a source. This is the 'one authority per class, one projection edge per
    artifact' rule applied to the projection manifest."""
    violations = []
    if manifest is None:
        if not PROJECTION_MANIFEST.exists():
            return violations
        try:
            manifest = json.loads(PROJECTION_MANIFEST.read_text())
        except (json.JSONDecodeError, OSError):
            return violations

    projections = set()
    superseded = set()
    for entry in matrix.get("authorities", []):
        for p in (entry.get("projections") or []):
            projections.add(normalize(p))
        for p in (entry.get("superseded") or []):
            superseded.add(normalize(p))

    for proj in manifest.get("projections", []):
        src = normalize(proj.get("sourceSchema", ""))
        if src in projections:
            violations.append({
                "failure_class": "unlisted-projection",
                "domain": src,
                "detail": "manifest sources from a projection, not the canonical authority",
            })
        elif src in superseded:
            violations.append({
                "failure_class": "unlisted-projection",
                "domain": src,
                "detail": "manifest sources from a superseded artifact",
            })

        # Executable verification: active projections must resolve, and any
        # declared digest must match the committed artifact.
        if not proj.get("active", True):
            continue
        out = normalize(proj.get("outputPath", ""))
        verify = proj.get("verify") or {}
        mode = verify.get("mode", "exists")

        if mode == "regenerate":
            # Strongest mode: run the generator, then require the output and
            # (optionally) lock the regenerated artifact against a committed
            # digest. A passing run proves the generator actually produces the
            # committed output — no silent divergence between source schema and
            # projection. Designed for TypeSpec codegen: flip `active: true` on
            # a projection with this verify block once its emitter is wired.
            command = verify.get("command")
            if not command:
                violations.append({
                    "failure_class": "projection-drift",
                    "domain": out,
                    "detail": "regenerate verify mode requires a `command`",
                })
                continue
            ok, detail = run_generator(command)
            if not ok:
                violations.append({
                    "failure_class": "projection-drift",
                    "domain": out,
                    "detail": f"regeneration failed: {detail}",
                })
                continue
            if not path_exists(out):
                violations.append({
                    "failure_class": "projection-drift",
                    "domain": src,
                    "detail": f"regeneration produced no output on disk: {out}",
                })
                continue
            if verify.get("digest"):
                algo = verify.get("algorithm", "sha256")
                expected = verify.get("digest")
                actual = file_digest(out, algo)
                if expected and actual != expected:
                    violations.append({
                        "failure_class": "projection-drift",
                        "domain": out,
                        "detail": (f"regeneration produced different content than the committed "
                                   f"digest ({algo}): expected {expected}, got {actual} — "
                                   f"committed projection is stale"),
                    })
            continue

        if not path_exists(out):
            violations.append({
                "failure_class": "projection-drift",
                "domain": src,
                "detail": f"active projection output missing on disk: {out}",
            })
            continue
        if mode == "digest":
            algo = verify.get("algorithm", "sha256")
            expected = verify.get("digest")
            actual = file_digest(out, algo)
            if expected and actual != expected:
                violations.append({
                    "failure_class": "projection-drift",
                    "domain": out,
                    "detail": f"digest mismatch ({algo}): expected {expected}, got {actual}",
                })
    return violations


def run_checks(matrix):
    violations = []
    violations += check_registry(matrix)
    index = collect_semantic_classes(matrix, list(iter_json_files()))
    violations += check_duplicate_class(matrix, index)
    violations += check_unlisted_projection(matrix)
    violations += check_manifest(matrix)
    return violations


# ─── Main ────────────────────────────────────────────────────────────────

def main():
    output_json = "--json" in sys.argv

    try:
        matrix = load_matrix()
    except (json.JSONDecodeError, OSError) as exc:
        print(f"[AUTHORITY] FAIL — cannot load matrix {MATRIX_PATH}: {exc}")
        return 1

    violations = run_checks(matrix)

    if output_json:
        print(json.dumps({
            "status": "PASS" if not violations else "FAIL",
            "matrix": str(MATRIX_PATH.relative_to(REPO_ROOT)),
            "total_violations": len(violations),
            "violations": violations,
        }, indent=2))
    else:
        if not violations:
            print("[AUTHORITY] PASS — single canonical authority per semantic domain")
        else:
            print("[AUTHORITY] FAIL — authority matrix violated:")
            by_class = {}
            for v in violations:
                by_class.setdefault(v["failure_class"], []).append(v)
            for fc in sorted(by_class):
                print(f"\n  [{fc}] ({len(by_class[fc])} violation(s))")
                for v in by_class[fc]:
                    print(f"    {v.get('domain')}: {v['detail']}")
            print(f"\n  Total: {len(violations)} violation(s)")

    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
