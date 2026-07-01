"""Import all non-ROVER audit files into the nebula database as agent records.

Skips: ROVER/, .obsidian/, and any files that appear to already be
represented in the DB (checked by sourceFile).
"""
import json
import os
import sys
import urllib.request
import urllib.error

AUDIT_ROOT = "nexus/audit"
NEBULA_API = "http://localhost:3101/api/agent-records"

# ── Directory → (recordType, role) mapping ──
# Valid recordTypes: report, analysis, assessment, inspection, prompt,
# response, engineering_log, architecture_note, decision
DIR_META = {
    "ANALYSIS":           ("analysis",          "analyst"),
    "ARCHITECTURE":       ("architecture_note", "architect"),
    "ENGINEERING":        ("engineering_log",   "engineer"),
    "PLANS":              ("assessment",        "planner"),
    "IMPLEMENTATION_PLANS": ("assessment",      "planner"),
    "SPECS":              ("architecture_note", "architect"),
    "PROMPTS":            ("prompt",            "architect"),
    "RESPONSES":          ("response",          "architect"),
    "INSPECTIONS":        ("inspection",        "inspector"),
    "CHANGES":            ("engineering_log",   "engineer"),
    "FINDINGS":           ("analysis",          "analyst"),
    "REQUIREMENTS":       ("assessment",        "analyst"),
    "REVIEWS":            ("inspection",        "reviewer"),
    "BUILDER":            ("engineering_log",   "engineer"),
    "KNOWLEDGE":          ("architecture_note", "architect"),
    "STEWARD":            ("architecture_note", "architect"),
    "HISTORY":            ("report",            "architect"),
    "ARCHIVES":           ("report",            "architect"),
}

SKIP_DIRS = {"ROVER", ".obsidian", "chats"}
MAX_CONTENT_BYTES = 500_000  # ~500KB per file max


def get_already_imported() -> set[str]:
    """Query existing agent records and return their source_path values.

    Uses the nebula-srv API with a high limit to get all records.
    Returns a set of file paths already in the DB.
    """
    imported: set[str] = set()
    try:
        req = urllib.request.Request(
            f"{NEBULA_API}?limit=2000",
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.load(resp)
        records = data if isinstance(data, list) else data.get("records", data.get("data", []))
        for r in records:
            sp = r.get("source_path", "")
            if sp:
                imported.add(sp)
        print(f"Already in DB (by source_path): {len(imported)}")
    except Exception as e:
        print(f"WARNING: Could not query existing records: {e}")
        print("  Proceeding without dedup — duplicates may occur.")
    return imported


def dir_meta(path_parts: list[str]):
    """Determine recordType and role from audit path parts."""
    # path_parts example: ["nexus", "audit", "ANALYSIS", "somefile.md"]
    for i, part in enumerate(path_parts):
        if part in DIR_META:
            return DIR_META[part]
    # Try subdirectory of a known dir (e.g. IMPLEMENTATION_PLANS/pending/)
    for i, part in enumerate(path_parts):
        for known in DIR_META:
            if part.startswith(known) or known.startswith(part):
                return DIR_META[known]
    return ("report", "architect")  # default


def read_file_safe(path: str) -> str | None:
    """Read file content, return None if too large or unreadable."""
    try:
        size = os.path.getsize(path)
        if size > MAX_CONTENT_BYTES:
            print(f"  SKIP (too large {size}B): {path}")
            return None
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as e:
        print(f"  SKIP (read error): {path} — {e}")
        return None


def create_record(
    title: str,
    content: str,
    record_type: str,
    role: str,
    source_file: str,
) -> bool:
    """POST a new agent record to nebula-srv. Returns True on success."""
    payload = {
        "recordType": record_type,
        "role": role,
        "title": title,
        "content": content,
        "sourcePath": source_file,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        NEBULA_API,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp_data = json.load(resp)
            rid = resp_data.get("id", resp_data.get("record", {}).get("id", "?"))
            print(f"  ✅ {rid[:12]}  {record_type:20s}  {source_file}")
            return True
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        print(f"  ❌ HTTP {e.code}  {source_file}  — {body}")
        return False
    except Exception as e:
        print(f"  ❌ ERROR  {source_file}  — {e}")
        return False


def main():
    # Use explicit path — works regardless of how the script is invoked
    script_dir = os.path.dirname(os.path.abspath(__file__)) if '__file__' in dir() else os.getcwd()
    project_root = os.path.dirname(script_dir) if os.path.basename(script_dir) == 'scripts' else script_dir
    # Try known project root
    for candidate in [project_root, '/home/codex/dev']:
        if os.path.isdir(os.path.join(candidate, 'nexus/audit')):
            os.chdir(candidate)
            break

    # ── Collect files to import ──
    to_import = []
    for root, dirs, filenames in os.walk(AUDIT_ROOT):
        # Skip unwanted directories
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]

        for fn in filenames:
            full = os.path.join(root, fn)
            to_import.append(full)

    print(f"Files to import: {len(to_import)}")

    # ── Dedup: skip files already in the DB ──
    already_imported = get_already_imported()
    print()

    # ── Import each file ──
    ok = 0
    skip = 0
    fail = 0

    for i, filepath in enumerate(sorted(to_import)):
        # Skip if already in DB
        if filepath in already_imported:
            skip += 1
            continue

        parts = filepath.split(os.sep)
        title = os.path.splitext(parts[-1])[0].replace("-", " ").replace("_", " ")
        record_type, role = dir_meta(parts)

        content = read_file_safe(filepath)
        if content is None:
            skip += 1
            continue

        if create_record(title, content, record_type, role, filepath):
            ok += 1
        else:
            fail += 1

        # Progress every 20
        if (ok + skip + fail) % 20 == 0:
            print(f"  ... {ok + skip + fail}/{len(to_import)} "
                  f"(ok={ok} skip={skip} fail={fail})")

    print()
    print("=" * 60)
    print(f"RESULTS: {ok} created, {skip} skipped, {fail} failed")
    print(f"Total: {ok + skip + fail}/{len(to_import)}")


if __name__ == "__main__":
    main()
