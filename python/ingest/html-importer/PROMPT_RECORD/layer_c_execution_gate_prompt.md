# 📌 LAYER C — TRANSITION VALIDATION TRUTH TABLE
SYSTEM / DEVELOPER PROMPT

You are implementing Layer C: Execution Eligibility Gate in the Nexus IR system.
Layer C evaluates TransitionRequest objects ONLY.
It does not interpret semantics, archetypes, or raw IR events.
It only validates whether a proposed state transition is allowed.

## 🚨 CORE PRINCIPLE
Layer C is a deterministic function:
Decision = f(TransitionRequest, TrajectoryState, ConstraintNodes, PolicyRules)

No inference. No intent. No narrative reasoning.

## 🧱 INPUT CONTRACT
Layer C receives:
```json
TransitionRequest {
  "trajectory_id": "str",
  "from_state": "str",
  "to_state": "str",
  "trigger": "str",
  "evidence": {},
  "confidence": 0.0
}
```

AND: current Trajectory state, ConstraintNode snapshot, policy configuration.

## 🔐 OUTPUT CONTRACT
Exactly one:
APPROVE_EXECUTION
ROUTE_TO_SANDBOX
REJECT_TRANSITION

## 📊 LAYER C STATE TRANSITION TRUTH TABLE

### 🟢 ACTIVE STATE
| To State | Decision | Condition |
| --- | --- | --- |
| INTERMEDIATE | APPROVE_EXECUTION | Structural mutation or transaction boundary detected |
| BLOCKED | APPROVE_EXECUTION | ConstraintNode(type=critical) becomes OPEN |
| PAUSED | APPROVE_EXECUTION | explicit pause trigger |
| CLOSED | ROUTE_TO_SANDBOX | only if ALL conditions satisfied (constraints closed, no pending mutations) |
| ABORTED | APPROVE_EXECUTION | failure signal or rollback condition |

### 🟡 BLOCKED STATE
| To State | Decision | Condition |
| --- | --- | --- |
| ACTIVE | APPROVE_EXECUTION | ALL blocking constraints resolved |
| INTERMEDIATE | REJECT_TRANSITION | cannot bypass constraint resolution |
| CLOSED | REJECT_TRANSITION | never direct closure from BLOCKED |
| PAUSED | APPROVE_EXECUTION | override allowed |

### 🟠 INTERMEDIATE STATE
| To State | Decision | Condition |
| --- | --- | --- |
| ACTIVE | APPROVE_EXECUTION | transaction boundary closed |
| BLOCKED | APPROVE_EXECUTION | constraint triggered mid-flight |
| CLOSED | ROUTE_TO_SANDBOX | only if: no pending mutations AND constraints satisfied |
| ABORTED | APPROVE_EXECUTION | execution failure detected |

### 🔵 PAUSED STATE
| To State | Decision | Condition |
| --- | --- | --- |
| ACTIVE | APPROVE_EXECUTION | resume signal present |
| BLOCKED | APPROVE_EXECUTION | constraint activation |
| CLOSED | ROUTE_TO_SANDBOX | only if clean termination conditions satisfied |

### 🔴 CLOSED STATE
| To State | Decision | Condition |
| --- | --- | --- |
| ANY | REJECT_TRANSITION | immutable state |

### ⚫ ABORTED STATE
| To State | Decision | Condition |
| --- | --- | --- |
| ACTIVE (new) | REJECT_TRANSITION | must spawn new trajectory |
| ANY | REJECT_TRANSITION | no re-entry allowed |

## ⚠️ GLOBAL GUARD CONDITIONS (APPLY TO ALL STATES)

**1. Constraint Gate (HARD BLOCK)**
IF any ConstraintNode(type ∈ {LEGAL, SAFETY, POLICY}) is OPEN
AND to_state == CLOSED
→ ROUTE_TO_SANDBOX (never direct approve)

**2. Schema Safety Gate**
IF schema_version is unknown OR incompatible
→ ROUTE_TO_SANDBOX

**3. Pending Mutation Gate**
IF IR_EventEnvelope.pending_mutations ≠ ∅
AND to_state == CLOSED
→ REJECT_TRANSITION

**4. Confidence is NOT authority**
confidence is informational only. NEVER used to override structural or constraint rules.

## 🧠 DESIGN INVARIANTS
- **INVARIANT 1 — No semantic inference**: Layer C must not interpret meaning from archetypes, event text, user intent, or system suggestions.
- **INVARIANT 2 — Deterministic evaluation**: Same input → same output always.
- **INVARIANT 3 — No state mutation**: Layer C does NOT modify Trajectory state.
- **INVARIANT 4 — No execution initiation**: Layer C only approves routing outcomes.

## 🧭 SYSTEM POSITION
IR_EventEnvelope → TransitionSynthesizer → TransitionRequest → Layer C (THIS SPEC) → Trajectory FSM → ReplayEngine

## 🧠 FINAL DESIGN INTENT
Layer C is a pure deterministic policy evaluator over explicit lifecycle transition proposals.
It is NOT an agent, a planner, a reasoning system, or a completion detector.
