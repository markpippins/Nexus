# CPF Funnel — DeepSeek UI Integration Point

## Overview

The Compilation-adjacent Readiness (CPF) funnel solves the "what's pending
to compile?" problem. It surfaces harvest candidates ordered by readiness,
so the UI shows a **funnel** instead of a grab-bag.

## Endpoint

```bash
# All ready candidates (CPF >= 0.7)
cd /home/codex/dev/nexus/python/rover
source .venv/bin/activate
python3 cpf_query.py --json

# Custom threshold (show everything above 0.5)
python3 cpf_query.py --json --threshold 0.5

# Single candidate detail
python3 cpf_query.py --json --candidate <uuid>

# All candidates regardless of score
python3 cpf_query.py --json --all

# Just the count
python3 cpf_query.py --count
```

## JSON Output Shape

```json
[
  {
    "id": "f0b9649e-0576-43a2-85a0-706dd06789d9",
    "title": "Requirement → WorkRequest Compilation Pipeline",
    "intent_description": "...",
    "status": "promoted",
    "compilation_readiness": 0.97,
    "completed": true,
    "tags": ["compiler", "pipeline", "requirement"],
    "system_name": "TypeSpec, Contracts & Code Generation",
    "subsystem_name": "Compiler Pipeline",
    "dep_count": 0,
    "promotable": true
  }
]
```

## Key Fields for UI

| Field | Purpose |
|-------|---------|
| `id` | UUID for drill-down |
| `title` | Candidate title (plan name) |
| `compilation_readiness` | CPF score 0.0–1.0 |
| `system_name` / `subsystem_name` | Hierarchical mapping |
| `tags` | Tag-based filtering |
| `promotable` | Boolean: ready for pipeline (`>= 0.7`) |
| `dep_count` | Dependency count (increases with DAG complexity) |
| `status` | `pending`, `promoted`, `linked`, `useful`, `rejected` |

## CPF Scoring Components

| Component | Weight | Source |
|-----------|--------|--------|
| `intent_filled` | 0.20 | Non-empty `intent_description` |
| `hierarchy_mapped` | 0.20 | System (0.10) + Subsystem (0.07) + Feature (0.03) |
| `tagged` | 0.10 | 2+ tags (0.10), 1 tag (0.03) |
| `has_artifacts` | 0.20 | Implementation notes (0.10) + code snippets (0.10) |
| `deps_resolved` | 0.20 | All dependencies promoted or completed |
| `reconciled` | 0.10 | `completed` flag from 3-path reconciliation |

## UI Design Suggestion

### Funnel View (default)

```
┌─────────────────────────────────────────────┐
│  CPF Funnel                         771 ready│
├─────────────────────────────────────────────┤
│  ████████████████████████  0.90-1.00  (12)  │
│  ████████████████████      0.80-0.89  (45)  │
│  ██████████████            0.70-0.79  (714) │
│  ───────────────────────────────────        │
│  ████                      0.60-0.69  (81)  │
│  ██                        0.50-0.59  (55)  │
│  █                         0.00-0.49  (161) │
└─────────────────────────────────────────────┘
```

### Actionable Controls
- **Threshold slider** — dynamically adjust CPF cutoff (default 0.7)
- **System filter** — dropdown of `system_name` values
- **Status filter** — `pending`, `promoted`, `all`
- **Promote button** — calls `candidate_promote.py --candidate <uuid>` or the full `promote-ready.sh`

## Promotion Lifecycle

```
Candidate (CPF ≥ 0.7)
  → Requirement (nebula.requirements, candidate_id back-link)
    → Conduit Plan (pending, PLAN_CREATE receipt)
      → Candidate status → 'promoted'
```

The UI should show:
- **Ready tab**: candidates ready for promotion (CPF ≥ 0.7, status ≠ promoted)
- **Promoted tab**: candidates already in the pipeline (status = promoted)
- **Pipeline tab**: conduit plans linked to promoted candidates

## Automation

Cron currently runs:
- `compute-cpf.sh` every 15 min — refreshes CPF scores
- `promote-ready.sh --limit 5` every 30 min — auto-promotes ready candidates

Manual promotion (for specific candidates):
```bash
./nexus/scripts/bash/promote-ready.sh --candidate <uuid>
```

## Current Pipeline State (2026-07-03)

- **Ready (CPF ≥ 0.7):** 771 candidates
- **Already Promoted:** 58 candidates → 15 conduit plans
- **Near-miss (CPF 0.50-0.69):** 81 candidates (need subsystem mapping or reconciliation)
- **Unscored / Low (CPF < 0.50):** 161 candidates (need intent extraction or system mapping)
- **Total in DB:** ~1013 candidates

## Quick Reference

```bash
# Shell alias (add to ~/.bashrc)
alias cpf-stats='cd /home/codex/dev/nexus && source python/rover/.venv/bin/activate && python3 python/rover/cpf_query.py --json --threshold 0.7 | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"Ready: {len(d)}\")"'

# Shell alias (count only)
alias cpf-count='cd /home/codex/dev/nexus && source python/rover/.venv/bin/activate && python3 python/rover/cpf_query.py --count'
```
