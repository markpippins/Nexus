"""Source discovery (spec C5): glob semantics with excludes, depth, symlinks,
and first-match-wins collision policy."""

from __future__ import annotations

import fnmatch
import os
from pathlib import Path

from .errors import AbsorbError

DEFAULT_MAX_DEPTH = 10


def _rel_matches(rel: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatch(rel, pat) or fnmatch.fnmatch(Path(rel).name, pat) for pat in patterns)


def _walk(repo_root: Path, pattern: str, exclude: list[str], max_depth: int,
          follow_symlinks: bool) -> list[str]:
    """Expand one glob entry into matching file paths (deterministic order).
    Relative patterns resolve against repo_root."""
    # Support both `dir/*.md` and bare patterns; base = longest existing prefix.
    pattern_path = Path(pattern)
    if pattern_path.is_absolute():
        base_dir, pat = pattern_path.parent, pattern_path.name
    else:
        parts = pattern_path.parts
        # find the first part containing a wildcard
        split = next((i for i, p in enumerate(parts) if any(c in p for c in "*?[")), len(parts))
        base_dir = Path(*parts[:split]) if split else Path(".")
        pat = str(Path(*parts[split:])) if split < len(parts) else parts[-1]
    if not base_dir.is_absolute():
        base_dir = repo_root / base_dir
    if not base_dir.exists():
        return []

    out: list[str] = []
    base_depth = len(base_dir.resolve().parts)
    for root, dirs, files in os.walk(base_dir, followlinks=follow_symlinks):
        rel_root = Path(root).resolve().relative_to(base_dir.resolve())
        depth = len(rel_root.parts)
        if depth >= max_depth:
            dirs[:] = []
        # honor exclude on directory names during traversal
        keep = []
        for d in dirs:
            rel = str(rel_root / d)
            if not _rel_matches(rel + "/", [p.rstrip("/") + "/" for p in exclude]) \
               and not _rel_matches(f"{rel}/*", exclude):
                keep.append(d)
        dirs[:] = keep

        for f in sorted(files):
            rel = str(rel_root / f) if str(rel_root) != "." else f
            full = str(Path(root) / f)
            # fnmatch against the glob tail (supports ** via simple walk+match)
            tail = "/".join([rel] if "/" not in pat else rel.split("/")[-len(pat.split("/")):])
            if fnmatch.fnmatch(rel, pat) or fnmatch.fnmatch(f, pat):
                if not _rel_matches(rel, exclude):
                    out.append(full)
    return out


def discover(source_entries: list[dict], repo_root: Path) -> dict:
    """Expand profile `sources:` entries.

    Collision policy (spec C5): FIRST-MATCH-WINS across entries in declaration
    order, emitting W_GLOB_COLLISION warnings; an entry may opt into strict
    mode with `collision: error`.

    Returns {files: [{path, source_index}], warnings: [{code, message}]}
    """
    seen: dict[str, int] = {}
    files: list[dict] = []
    warnings: list[dict] = []

    for idx, entry in enumerate(source_entries):
        pattern = entry.get("glob")
        if not pattern:
            raise AbsorbError("E_CONFIG_BAD_SOURCE", "source entry missing 'glob'")
        exclude = entry.get("exclude", [])
        max_depth = int(entry.get("max_depth", DEFAULT_MAX_DEPTH))
        follow = bool(entry.get("follow_symlinks", False))  # default OFF (C5)
        strict = entry.get("collision") == "error"

        found = _walk(repo_root, pattern, exclude, max_depth, follow)

        for path in sorted(found):
            path = str(Path(path).resolve())
            if path in seen:
                msg = f"{path} matched globs #{seen[path]} and #{idx}"
                if strict:
                    raise AbsorbError("E_CONFIG_GLOB_COLLISION", msg)
                warnings.append({"code": "W_GLOB_COLLISION", "message": msg})
                continue  # first match wins
            seen[path] = idx
            files.append({"path": path, "source_index": idx})

    files.sort(key=lambda x: x["path"])  # deterministic processing order
    return {"files": files, "warnings": warnings}
