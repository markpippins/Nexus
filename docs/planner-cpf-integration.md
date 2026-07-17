# Planner + CPF Integration

## The Insight

The Planner is the **scrum master**. CPF (Compilation-adjacent Readiness Funnel)
is the **deterministic key to backlog grooming**.

Instead of asking arbitrary questions, the Planner applies CPF scoring logic
to systematically evaluate whether candidates are ready for promotion.

## CPF Scoring Components → Open Questions

| CPF Component | Weight | Missing → Open Question Category | Example Question |
|---------------|--------|----------------------------------|------------------|
| `intent_filled` | 0.20 | MISSING_INFO | "What is the goal of this requirement?" |
| `hierarchy_mapped` | 0.20 | AMBIGUITY | "Which system/subsystem does this belong to?" |
| `tagged` | 0.10 | MISSING_INFO | "What categories apply to this?" |
| `has_artifacts` | 0.20 | MISSING_INFO | "Do we have implementation notes or code snippets?" |
| `deps_resolved` | 0.20 | DEPENDENCY | "What dependencies need to be resolved first?" |
| `reconciled` | 0.10 | SCOPE | "Is this requirement complete and reconciled?" |

## Decision Framework

### Pre-Greenlight Evaluation (Planner)

```
1. Compute CPF score for candidate
2. If CPF >= 0.7:
   → Run ripple assessment (blast radius analysis)
   → If risk != CRITICAL:
     → GREENLIGHT (create requirement, promote to conduit)
   → If risk == CRITICAL:
     → Create open questions for blocking issues
     → Defer until questions resolved
3. If CPF < 0.7:
   → Identify missing components
   → Create open questions for gaps
   → Set status to 'pending' with assigned owner
```

### Backlog Grooming (Automated)

```
Every 30 minutes (Planner cron):
1. Scan candidates with status='pending' AND CPF < 0.7
2. For each candidate:
   a. Compute CPF components
   b. Identify which components are below threshold
   c. Create open questions for missing components
   d. Assign questions to appropriate roles (Analyst, Architect, etc.)
3. Scan candidates with status='pending' AND CPF >= 0.7
   a. Run ripple assessment
   b. If risk != CRITICAL → auto-promote to requirement
   c. If risk == CRITICAL → create escalation to Architect
```

## Two-Level Assessment

### Level 1: CPF (Readiness)
- **Question**: "Is this candidate ready to become a requirement?"
- **Mechanism**: 6-component scoring algorithm
- **Threshold**: CPF >= 0.7 for promotion
- **Output**: Score + component breakdown + open questions for gaps

### Level 2: Ripple (Impact)
- **Question**: "What happens if we implement this?"
- **Mechanism**: DAG traversal + blast radius analysis
- **Threshold**: risk_level != CRITICAL for greenlight
- **Output**: Blast radius + affected systems + suggested questions

### Flow

```
Candidate → CPF Assessment → Ready? → Ripple Assessment → Safe? → Greenlight
                ↓                ↓            ↓              ↓
            Open Questions   Defer        Escalate      Create Requirement
```

## Current State

- **1,868 total candidates**
- **530 ready (CPF >= 0.7)** — but 481 already promoted
- **49 truly ready** — pending promotion
- **1,123 near-miss (0.6-0.7)** — need grooming
- **137 low (<0.5)** — need significant work

## Integration Points

### Existing
- `cpf_compute.py` — Python script computing CPF scores
- `cpf_query.py` — Query tool for CPF state
- `compute-cpf.sh` — Cron job (every 15 min)
- `promote-ready.sh` — Auto-promotion (every 30 min)

### Planned (Planner Role)
- `nebula.assess_cpf(requirement_id)` — SQL function for CPF scoring
- `nebula.groom_backlog()` — Automated backlog grooming
- `nebula.create_questions_from_cpf(requirement_id)` — Generate open questions from CPF gaps

## Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Candidates ready (CPF >= 0.7) | 49 | 0 (all promoted) |
| Near-miss (0.6-0.7) | 1,123 | 500 (groomed) |
| Low (<0.5) | 137 | 50 (archived or groomed) |
| Avg time to promotion | Unknown | < 24 hours |
| Open questions per candidate | 0 | 2-3 (grooming) |
