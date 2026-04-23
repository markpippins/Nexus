# 📌 NEXUS IR — TRANSITION SYNTHESIZER + EVENT TAXONOMY + LAYER C BOUNDARY
SYSTEM / DEVELOPER PROMPT

You are implementing the TransitionSynthesizer layer in the Nexus IR system.

This layer sits between:
IR_EventEnvelope (structural events)
→ TransitionRequest generation
→ Layer C (Execution Eligibility Gate)

## 🚨 CORE PRINCIPLE
The TransitionSynthesizer does NOT decide correctness.
It ONLY proposes candidate lifecycle transitions.
All final authorization is handled by Layer C.

## 🧱 PIPELINE ARCHITECTURE
IR_EventEnvelope
      ↓
TransitionSynthesizer (THIS LAYER)
      ↓
TransitionRequest(s)
      ↓
Layer C (policy validation)
      ↓
Trajectory FSM update
      ↓
ReplayEngine

## 🔒 HARD CONSTRAINTS
### 1. No semantic interpretation
You MUST NOT use:
archetypes (Delegated Request, etc.)
intent inference
natural language understanding
“task completion” heuristics
Only STRUCTURAL signals are valid.

### 2. No execution authority
This layer MUST NOT:
approve transitions
reject transitions
route to sandbox
mutate trajectory state
It ONLY emits TransitionRequest candidates.

## 🧩 INPUT: IR_EVENTENVELOPE
Each event is a deterministic structural mutation:
```json
{
  "added_nodes": [],
  "modified_nodes": [],
  "removed_nodes": [],
  "emitted_edges": [],
  "emitted_observations": [],
  "transaction_id": "",
  "schema_version": ""
}
```

## 📡 EVENT TAXONOMY (DETERMINISTIC SIGNAL SET)
These are the ONLY valid event types TransitionSynthesizer may interpret.

**🧱 1. STRUCTURAL_MUTATION**
Triggered by: added_nodes, modified_nodes, removed_nodes
Meaning: system state has changed materially

**🔗 2. EDGE_EMISSION_EVENT**
Triggered by: emitted_edges
Meaning: new dependency or relationship introduced
Often suggests progression in ACTIVE state or entry into INTERMEDIATE (batch mode).

**👁 3. OBSERVATION_EVENT**
Triggered by: emitted_observations
Meaning: informational-only update, no structural mutation. Never triggers completion alone.

**🧾 4. TRANSACTION_BOUNDARY_EVENT**
Triggered by: transaction_id changes, batch grouping of multiple IR envelopes
Meaning: execution is entering or exiting INTERMEDIATE state

**🧮 5. NO_OP_STABILITY_EVENT**
Triggered by: empty diffs, no structural change over N steps
Meaning: potential stabilization signal (May contribute to completion candidate generation, never direct completion).

**⚠️ 6. CONSTRAINT_CHANGE_EVENT**
Triggered by: ConstraintNode state change in IR graph snapshot
Meaning: may affect BLOCKED / ACTIVE transitions indirectly

**🧊 7. SCHEMA_TRANSITION_EVENT**
Triggered by: schema_version change
Meaning: requires reinterpretation layer downstream (May force SANDBOX routing via Layer C, but NOT decided here).

## 🔁 TRANSITION SYNTHESIS RULES
For each IR_EventEnvelope, generate candidate TransitionRequest(s).

**RULE A — STRUCTURAL_MUTATION → ACTIVE / INTERMEDIATE**
If STRUCTURAL_MUTATION occurs:
ACTIVE → INTERMEDIATE (if batch/transaction context exists)
INTERMEDIATE → ACTIVE (if batch completes)

**RULE B — TRANSACTION_BOUNDARY_EVENT → INTERMEDIATE**
Always propose:
ACTIVE → INTERMEDIATE (start)
INTERMEDIATE → ACTIVE (end)
Never assume closure.

**RULE C — NO_OP_STABILITY_EVENT → CANDIDATE_CLOSURE**
If repeated stability observed:
propose ACTIVE → CLOSED (candidate only); Layer C must validate.

**RULE D — CONSTRAINT_CHANGE_EVENT → BLOCKED CANDIDATE**
If critical constraint becomes OPEN: ACTIVE → BLOCKED
If resolved: BLOCKED → ACTIVE

**RULE E — SCHEMA_TRANSITION_EVENT → SANDBOX CANDIDATE**
Always propose:
ACTIVE → INTERMEDIATE (safe re-evaluation state)
or ACTIVE → BLOCKED (if unsafe schema mismatch detected)
Never propose CLOSED directly.

**RULE F — EDGE_EMISSION_EVENT**
Suggests continuation of ACTIVE or entry into INTERMEDIATE if part of batch graph mutation.
No direct closure implication.

## 📦 OUTPUT: TRANSITION REQUEST FORMAT
Each output MUST be:
```json
{
  "trajectory_id": "string",
  "from_state": "ACTIVE | BLOCKED | INTERMEDIATE | PAUSED",
  "to_state": "ACTIVE | BLOCKED | INTERMEDIATE | CLOSED | ABORTED",
  "trigger": "STRUCTURAL_MUTATION | TRANSACTION_BOUNDARY | ...",
  "evidence": {
    "event_types": [],
    "affected_nodes": [],
    "transaction_id": ""
  },
  "confidence": 0.0-1.0
}
```

## 🔐 IMPORTANT DESIGN GUARANTEE
This layer MUST ensure:
✔ Determinism: Same IR input → same TransitionRequest output
✔ Non-authority: Never approves or rejects transitions
✔ No semantic leakage: No intent, no reasoning, no interpretation of meaning
✔ Pure structural causality: Only event-driven inference is allowed

## 🧠 DESIGN INTENT
This layer exists to convert raw structural IR changes into lifecycle transition candidates in a fully deterministic, replay-safe manner.
It is NOT an agent, planner, decision system, or policy engine.
