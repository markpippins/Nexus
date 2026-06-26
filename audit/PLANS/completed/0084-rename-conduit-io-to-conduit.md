---
project: conduit
dependencies: []
acceptance:
  - test -d /home/codex/dev/nexus/python/conduit.o && echo "OLD DIR EXISTS (should be gone after rename)"
  - test -d /home/codex/dev/nexus/python/conduit && echo "NEW DIR EXISTS"
  - rg "conduit\.io" /home/codex/dev/nexus -g '!.git' -g '!*.pyc' -g '!__pycache__' -g '!.venv' -g '!.angular' -g '!node_modules' -g '!dist' -g '!*.log' 2>&1 || true
---

# Plan 0084: Rename `nexus/python/conduit.io` → `nexus/python/conduit`

**Goal:** Rename the `conduit.io` Python package directory to `conduit`, aligning
the naming with the Conduit brand (no `.io` suffix). This requires coordinated
changes across Python code, documentation, cron references, systemd units,
and the Makefile.

**Status:** PLAN — ready for builder pickup

---

## Context: Why `conduit.io` Exists

The `conduit.io` directory (`nexus/python/conduit.io/`) contains the **Temporal-based**
Conduit pipeline orchestration system:

| File | Purpose |
|------|---------|
| `db_adapter.py` | PostgreSQL adapter wrapping all DB operations |
| `work_request.py` | WorkRequest data model and factory |
| `executor_registry.py` | Agent executor dispatch registry |
| `harness_launcher.py` | Model harness invocation |
| `env_config.py` | Environment variable loading (.env) |
| `temporal/scheduler.py` | Scans eligible plans, starts Temporal workflows |
| `temporal/worker.py` | Temporal Worker running Activities + Workflows |
| `temporal/activities/` | Activity implementations (DB ops, model execution) |
| `temporal/workflows/` | PlanExecutionWorkflow |
| `temporal/tests/` | E2E pipeline tests |

The `.io` suffix was used to distinguish this Temporal-based rewrite from the
**legacy** Conduit (`nexus/legacy/python/conduit/`), which is the cron-driven
system. The legacy directory is already under `legacy/`, so the suffix is
unnecessary — `nexus/python/conduit` is unambiguous now.

**No collision:** The legacy conduit is at `nexus/legacy/python/conduit/`, not
under `nexus/python/`. Renaming to `nexus/python/conduit` causes zero conflicts.

---

## Phase 1: Audit All `conduit.io` References

### 1.1 Code References (Need Updates)

| File | Line(s) | Reference Type |
|------|---------|---------------|
| `nexus/python/conduit.io/temporal/worker.py` | 7, 8, 23, 27 | Docstring paths, path setup comment |
| `nexus/python/conduit.io/temporal/scheduler.py` | 11-14, multiple | Docstring paths, path setup comment |
| `nexus/python/conduit.io/temporal/activities/db_operations.py` | 16 | Path setup comment |
| `nexus/legacy/python/conduit/main.py` | 148 | Comment referencing `conduit.io/temporal/` |
| `nexus/legacy/python/conduit/tests/test_e2e_pipeline.py` | 383 | Comment referencing `conduit.io/temporal/tests/` |
| `nexus/legacy/python/conduit/tests/test_dispatch_integration.py` | 4, 20 | Comments referencing `conduit.io/temporal/` |
| `nexus/legacy/python/conduit/tests/test_e2e_pipeline_v2.py` | 4, 20 | Comments referencing `conduit.io/temporal/` |

**Note:** The `sys.path` manipulation in `worker.py`, `scheduler.py`, and
`db_operations.py` uses `Path(__file__).resolve().parent.parent` — this is
relative and will work correctly after the rename without changes.

### 1.2 Documentation References (Need Updates)

| File | Line(s) | Content |
|------|---------|---------|
| `CRONTAB.txt` | 3 | `# Replaced by: Temporal Scheduler (nexus/python/conduit.io/temporal/scheduler.py)` |
| `nexus/graph/peb-mcp-spec.md` | 840 | `### 9.2 With Temporal (conduit.io)` |
| `nexus/graph/workflow/README.md` | 22 | `├── plan-execution.json -- PlanExecutionWorkflow (conduit.io/temporal)` |

### 1.3 Systemd Units

No `conduit.io` references found in `*.service` files under `/etc/systemd/system/`
or the nexus tree. Conduit runs as a Temporal Worker (started via systemd or
manually with `python -m conduit.io.temporal.worker`). After the rename, the
invocation becomes `python -m conduit.temporal.worker`.

**Action:** Check running services:
```bash
systemctl list-units --type=service | grep -i conduit
ps aux | grep conduit
```

### 1.4 Makefile

The `Makefile` at `nexus/Makefile` references `legacy/python/conduit` (NOT
`conduit.io`). No Makefile updates are needed for this rename. The Temporal
conduit is not managed through the Makefile.

### 1.5 What Does NOT Change

- `nexus/legacy/python/conduit/` — untouched, at a different path level
- All imports using relative paths (`from env_config import ...`) — work fine
- All `sys.path` manipulations using `Path(__file__)` — work fine
- Module invocation: `python -m conduit.io.temporal.worker` becomes `python -m conduit.temporal.worker`

---

## Phase 2: Service Shutdown

### 2.1 Identify Running Services

```bash
# Check for running conduit processes
ps aux | grep -E 'conduit|temporal' | grep -v grep

# Check systemd
systemctl list-units --type=service --state=running | grep -i conduit
```

### 2.2 Stop Running Services

If any conduit-related processes are running:

```bash
# If systemd-managed:
sudo systemctl stop conduit-worker conduit-scheduler

# If running manually:
pkill -f "conduit.io.temporal"
```

---

## Phase 3: Directory Rename

### 3.1 Perform the Rename

```bash
cd /home/codex/dev/nexus/python
mv conduit.io conduit
```

### 3.2 Update Python Path References

All Python files that contain `conduit.io` in comments or docstrings:

**File: `nexus/python/conduit/temporal/worker.py`**
- Line 7: `python -m conduit.io.temporal.worker` → `python -m conduit.temporal.worker`
- Line 8: `python -m conduit.io.temporal.worker --role builder` → `python -m conduit.temporal.worker --role builder`
- Line 23: `# Ensure conduit.io is on the path` → `# Ensure conduit is on the path`
- Line 27: `# Load .env from conduit.io/` → `# Load .env from conduit/`

**File: `nexus/python/conduit/temporal/scheduler.py`**
- Line 11: `python -m conduit.io.temporal.scheduler` → `python -m conduit.temporal.scheduler`
- Line 12: same pattern
- Line 13-14: same pattern

**File: `nexus/python/conduit/temporal/activities/db_operations.py`**
- Line 16: `# Add conduit.io to path` → `# Add conduit to path`

**File: `nexus/legacy/python/conduit/main.py`**
- Line 148: `# Temporal Scheduler + Worker (nexus/python/conduit.io/temporal/)` → `# Temporal Scheduler + Worker (nexus/python/conduit/temporal/)`

**File: `nexus/legacy/python/conduit/tests/test_e2e_pipeline.py`**
- Line 383: `conduit.io/temporal/tests/` → `conduit/temporal/tests/`

**File: `nexus/legacy/python/conduit/tests/test_dispatch_integration.py`**
- Line 4, 20: `conduit.io/temporal/` → `conduit/temporal/`

**File: `nexus/legacy/python/conduit/tests/test_e2e_pipeline_v2.py`**
- Line 4, 20: `conduit.io/temporal/` → `conduit/temporal/`

### 3.3 Update Documentation

**File: `CRONTAB.txt`**
- Line 3: `conduit.io/temporal/scheduler.py` → `conduit/temporal/scheduler.py`

**File: `nexus/graph/peb-mcp-spec.md`**
- Line 840: `(conduit.io)` → `(conduit)`

**File: `nexus/graph/workflow/README.md`**
- Line 22: `conduit.io/temporal` → `conduit/temporal`

---

## Phase 4: Update Systemd (If Applicable)

If systemd units reference `conduit.io`, update them:

```ini
# Before
ExecStart=/home/codex/opt/anaconda3/bin/python3 -m conduit.io.temporal.worker

# After
ExecStart=/home/codex/opt/anaconda3/bin/python3 -m conduit.temporal.worker
```

Then reload and restart:
```bash
sudo systemctl daemon-reload
sudo systemctl restart conduit-worker conduit-scheduler
```

If managed via a different process manager (PM2, supervisor, etc.), update
those configs accordingly.

---

## Phase 5: Verification

### 5.1 Confirm Directory Renamed

```bash
test -d /home/codex/dev/nexus/python/conduit && echo "PASS: new dir exists" || echo "FAIL"
test ! -d /home/codex/dev/nexus/python/conduit.io && echo "PASS: old dir gone" || echo "FAIL"
```

### 5.2 Confirm Zero Remaining References

```bash
rg "conduit\.io" /home/codex/dev/nexus \
  -g '!.git' -g '!*.pyc' -g '!__pycache__' \
  -g '!.venv' -g '!.angular' -g '!node_modules' \
  -g '!dist' -g '!*.log'
```

Expected: zero results.

### 5.3 Verify Python Imports Still Work

```bash
cd /home/codex/dev/nexus/python
python -c "from conduit.env_config import load_env; print('import OK')"
python -c "from conduit.db_adapter import DBAdapter; print('db_adapter OK')"
```

### 5.4 Verify Scheduler Module Loads

```bash
cd /home/codex/dev/nexus/python
python -m conduit.temporal.scheduler --help  # should print usage
python -m conduit.temporal.worker --help     # should print usage
```

### 5.5 Verify Tests Pass (Legacy)

```bash
cd /home/codex/dev/nexus/legacy/python/conduit
python -m pytest tests/ -v --tb=short 2>&1 | tail -20
```

---

## Files Affected Summary

| Action | File |
|--------|------|
| **RENAME** | `nexus/python/conduit.io/` → `nexus/python/conduit/` |
| **MODIFY** | `nexus/python/conduit/temporal/worker.py` — docstring + comments |
| **MODIFY** | `nexus/python/conduit/temporal/scheduler.py` — docstring |
| **MODIFY** | `nexus/python/conduit/temporal/activities/db_operations.py` — comment |
| **MODIFY** | `nexus/legacy/python/conduit/main.py` — comment |
| **MODIFY** | `nexus/legacy/python/conduit/tests/test_e2e_pipeline.py` — comment |
| **MODIFY** | `nexus/legacy/python/conduit/tests/test_dispatch_integration.py` — comments |
| **MODIFY** | `nexus/legacy/python/conduit/tests/test_e2e_pipeline_v2.py` — comments |
| **MODIFY** | `CRONTAB.txt` — path reference |
| **MODIFY** | `nexus/graph/peb-mcp-spec.md` — section heading |
| **MODIFY** | `nexus/graph/workflow/README.md` — path |
| **MODIFY** | Systemd unit files (if they exist and reference `conduit.io`) |

---

## Acceptance Criteria

1. `nexus/python/conduit.io/` does not exist
2. `nexus/python/conduit/` exists with all original files intact
3. `rg "conduit\.io" nexus/` returns zero results (excluding .git, __pycache__, .venv, etc.)
4. `python -m conduit.temporal.scheduler --help` prints usage successfully
5. `python -m conduit.temporal.worker --help` prints usage successfully
6. Any stopped services restart successfully under the new path
7. Legacy conduit tests still pass (`cd nexus/legacy/python/conduit && python -m pytest tests/`)
8. Comment references in legacy test files are updated

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Python `__pycache__` with stale `.pyc` files referencing `conduit.io` | Medium | Low | Clear `__pycache__/` after rename: `find conduit -name __pycache__ -exec rm -rf {} +` |
| Running Temporal Worker with stale module cache | Low | Medium | Stop workers before rename, restart after |
| `.venv` site-packages with conduit.io eggs/links | Low | Medium | Recreate venv if needed: `python -m venv .venv && pip install -r requirements.txt` |
| Someone hardcoded `/home/codex/dev/nexus/python/conduit.io` in a shell alias | Low | Low | Search `~/.bashrc`, `~/.zshrc`, `~/.profile` for `conduit.io` |

---

*Plan created: 2026-06-15. Part of the Conduit naming cleanup series.*
