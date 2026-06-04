# Nexus Tools — Code Integrity & Governance Tooling

This directory contains the structural integrity tooling for the Nexus
repository: CIR (Code Integrity Runtime) v1 and v2, plus the ARL (Anti-Recursion
Linter).  These tools enforce the CIR-SDM ontology model, detect governance
drift, and patch violations deterministically.

---

## Inventory

| Tool | Location | Purpose | Entry point |
|------|----------|---------|-------------|
| **CIR-1 Scan** | `cir1/scan.py` | Build reference index of pipeline/intent patterns | `python cir1/scan.py` |
| **CIR-1 Lint** | `cir1/lint.py` | CIR-1 through CIR-5 ontology lint engine | `python cir1/lint.py --all` |
| **CIR-1 Patch** | `cir1/patch.py` | Deterministic patch engine (dry-run by default) | `python cir1/patch.py --apply` |
| **CIR v2 ARL** | `arl_linter.py` | 5-pass CIR-SDM structural linter orchestrator | `python arl_linter.py` |
| **ARL classification** | `arl/classification.py` | Map files to CIR-SDM domain labels | imported by `arl_linter.py` |
| **ARL authority** | `arl/authority.py` | Detect lifecycle definitions outside `pgv.state_machine.json` (I7) | imported by `arl_linter.py` |
| **ARL lattice** | `arl/lattice.py` | Enforce forbidden cross-domain keys per CIR-SDM lattice (I8) | imported by `arl_linter.py` |
| **ARL invariants** | `arl/invariants.py` | I1 (recursive wrappers), I2 (state in schema), I3 (cross-layer leak) | imported by `arl_linter.py` |
| **ARL graph** | `arl/graph.py` | Governance dependency graph, cycle detection, forbidden edge classification | imported by `arl_linter.py` |

---

## CIR-1 Suite (`cir1/`)

### cir1/scan.py — Reference Index Builder

Scans the repository with ripgrep for CIR-relevant patterns and writes a
line-numbered reference index.

```
python cir1/scan.py [root-dir] [output-file]
```

Default root is `.`, default output is `cir1_ref_index.txt`.

Patterns searched: `intent_source`, `.pipeline/`, `PIPELINE_`,
`normalize-intent`, `ExecutionState`, `DCO`, `ExecutorRegistry`, `skill_ref`,
`work_request`.

Classification categories: `PIPELINE_PHANTOM`, `DERIVATION_CONTRACT`,
`ASPIRATIONAL_SCHEMA`, `RUNTIME_ASSUMPTION`,
`UNIMPLEMENTED_REGISTRY`, `OTHER`.

### cir1/lint.py — CIR Ontology Lint Engine

Combined structural invariant gate for configuration ontology integrity.
Implements CIR-1 through CIR-5 with the CIR Semantic Domain Model (CIR-SDM)
to scope enforcement by artifact semantic domain and interpretation mode.

**CIR rules:**

| Rule | What it checks |
|------|----------------|
| CIR-1 | Phantom references — `intent_source` pointing to non-existent `.pipeline/` paths |
| CIR-2 | Cross-layer leakage — governance tokens in wrong domains (native-domain exempt) |
| CIR-3 | Implicit execution semantics — `mode`, `retry_policy`, `executor` without `execution_contract` |
| CIR-4 | Static derived state — state keys without `derived_by`/`event_log`/`replay` provenance |
| CIR-5 | Single Canonical Authority — same semantic class key in multiple authoritative locations |

```
python cir1/lint.py                           # CIR-1 only
python cir1/lint.py --cir2                    # CIR-1 + CIR-2
python cir1/lint.py --all                     # CIR-1 through CIR-5
python cir1/lint.py --strict                  # exit 1 on violations
```

**Enforcement levels:** `STRICT`, `STRICT_NATIVE`, `LIMITED`, `MINIMAL`, `None`.

**Exit codes:** 0 = pass, 1 = violations found in strict mode.

### cir1/patch.py — CIR Deterministic Patch Engine

Patches CIR violations in-place. Dry-run by default (shows unified diffs);
use `--apply` to write changes.

```
python cir1/patch.py                          # dry-run (show diffs)
python cir1/patch.py --apply                  # write changes
```

CIR-1 patches remove `intent_source` and downgrade `mode` to `"legacy"`.
CIR-2 through CIR-5 wrap violating values in quarantine markers:
`blocked_by_CIR2`, `quarantined_CIR3`, `quarantined_CIR4`, `quarantined_CIR5`.

---

## CIR v2 ARL (`arl_linter.py` + `arl/`)

### arl_linter.py — ARL Orchestrator

Runs a 5-pass CIR-SDM structural linter over the repository:

1. **Classification** — map every tracked file to a CIR-SDM domain label
2. **Authority (I7)** — detect lifecycle definitions outside `pgv.state_machine.json`
3. **Lattice (I8)** — enforce forbidden cross-domain keys per enforcement matrix
4. **Invariants (I1-I3)** — recursive wrappers, state in schema, cross-layer leak
5. **Graph (B2)** — governance dependency graph, cycle detection, forbidden edges

```
python arl_linter.py                          # scan repo root (CWD)
python arl_linter.py /path/to/repo            # scan specific path
python arl_linter.py --json                   # structured JSON output
```

**Exit codes:** 0 = PASS, 1 = FAIL.

**JSON output schema:**
```json
{
  "status": "FAIL",
  "violations": [{"type": "...", "severity": "CRITICAL", "path": "...", "detail": "..."}],
  "total_violations": 3,
  "graph": {"nodes": 12, "edges": 15, ...}
}
```

### arl/classification.py — CIR-SDM Domain Classification

Maps files to domain labels: `SCHEMA`, `CONFIG`, `LEDGER`, `STATE_MACHINE`,
`CODE`, `METADATA`, `DATA`, `BUILD`.  Classification uses filename matches,
path patterns, and file extension heuristics in priority order.

### arl/authority.py — Authority Uniqueness (I7)

Flags any lifecycle state, transition, or invariant definition outside
`pgv.state_machine.json`.  Violation type: `AUTHORITY_DRIFT` (CRITICAL).

### arl/lattice.py — Enforcement Matrix (I8)

Forbids cross-domain key leakage per CIR-SDM lattice rules.  Each governance
domain (`SCHEMA`, `CONFIG`, `LEDGER`, `STATE_MACHINE`) has a set of forbidden
keys (e.g. `SCHEMA` may not contain `states`, `transitions`, `events`, etc.).
Violation type: `LATTICE_VIOLATION` (CRITICAL).

### arl/invariants.py — Structural Invariants (I1-I3)

| Check | What it detects |
|-------|-----------------|
| I1 | Recursive `"original"` wrappers and nested quarantine markers |
| I2a | `execution_state` in `work_request.schema.json` |
| I2b | `canonical_state` inference outside `tools/arl/` |
| I3 | Forbidden keys in governance artifacts per layer definition |

### arl/graph.py — Governance Dependency Graph (B2)

Builds a reference dependency graph from tracked governance files, detects
cycles via DFS, and classifies edges into `INTRA_DOMAIN`, `ALLOWED_CROSS`,
or `FORBIDDEN`.  Forbidden edges include `SCHEMA → LEDGER`, `CODE → STATE_MACHINE`,
and similar cross-domain pairs.

Violation types: `GOVERNANCE_CYCLE`, `FORBIDDEN_GOVERNANCE_EDGE` (both CRITICAL).

---

## Makefile Integration

From the repository root Makefile:

| Target | Description |
|--------|-------------|
| `cir1` | Full CIR-1 pipeline: scan → lint → validate |
| `cir1-scan` | Run ripgrep reference scan |
| `cir1-lint` | Run CIR lint (CIR-1) |
| `cir1-validate` | Run CIR lint in strict mode (exit 1 on violations) |
| `cir1-fix` | Dry-run patch |
| `cir1-apply` | Apply patches |
| `cirN-lint` | Run CIR-N lint (e.g. `cir2-lint`, `cir3-lint`) |
| `cirN-validate` | Run CIR-N strict lint |
| `cir-arl` | Run CIR v2 ARL linter |
| `cir-arl-json` | Run CIR v2 ARL with JSON output |
| `cir-verify` | Full suite: CIR-1 through CIR-5 lint + ARL |
| `cir-validate` | Full strict suite: CIR-1 through CIR-5 validate + ARL |
| `install-hooks` | Install CIR pre-commit hook from `.githooks/pre-commit` |
