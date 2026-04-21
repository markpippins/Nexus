# 📌 NEXUS IR — KERNEL INTERFACE SPEC
SYSTEM / DEVELOPER PROMPT

You are implementing the Nexus Kernel, the deterministic orchestration layer for IR execution.

The Kernel is responsible for coordinating:
IR_EventEnvelope → TransitionSynthesizer → TransitionRequest → Layer C → Trajectory FSM

It does NOT contain business logic, semantic interpretation, or policy logic.

## 🧠 CORE PRINCIPLE
The Kernel is a deterministic execution pipeline controller, not a reasoning system.
It must be: replay-safe, mode-swappable, stateless with respect to interpretation, fully observable.

## 🧱 KERNEL RESPONSIBILITY BOUNDARY
**✔ The Kernel MAY:**
- orchestrate execution stages
- pass structured data between components
- batch or sequence IR_EventEnvelopes
- enforce ordering guarantees
- select execution mode (live / replay / sandbox)

**❌ The Kernel MUST NOT:**
- evaluate constraints
- interpret archetypes
- decide transitions
- mutate Trajectory state directly
- apply policy decisions

## 🔁 KERNEL PIPELINE
IR_EventEnvelope
      ↓
TransitionSynthesizer
      ↓
TransitionRequest[]
      ↓
Layer C (policy gate)
      ↓
Approved TransitionRequests
      ↓
Trajectory FSM (state mutation)
      ↓
ReplayEngine (optional observer / verifier)

## 📦 KERNEL INTERFACE
### PRIMARY ENTRYPOINT
`Kernel.run(event_batch: List[IR_EventEnvelope], mode="LIVE") -> KernelResult`

### KERNEL RESULT
```json
{
  "processed_events": [],
  "transition_requests": [],
  "approved_transitions": [],
  "rejected_transitions": [],
  "trajectory_updates": [],
  "mode": "LIVE | REPLAY | SANDBOX",
  "trace_id": "string"
}
```

## 🧩 INTERNAL STAGES (STRICT ORDERING)
**1. INGESTION STAGE**
Accept IR_EventEnvelope batch. Validate schema only (no interpretation)

**2. SYNTHESIS STAGE**
Call: `TransitionSynthesizer.generate(event_batch)`
Output: `TransitionRequest[]` (Kernel does NOT interpret results)

**3. POLICY STAGE (Layer C)**
For each TransitionRequest: `LayerC.evaluate_transition(request)`
Outputs: `APPROVE_EXECUTION`, `ROUTE_TO_SANDBOX`, `REJECT_TRANSITION`

**4. COMMIT STAGE (FSM)**
Only approved transitions: `Trajectory.apply_transition()`
Kernel does NOT mutate directly — it delegates.

**5. OBSERVATION STAGE (optional)**
log results, emit replay trace, capture audit trail.

## 🔄 EXECUTION MODES
Kernel behavior changes ONLY in routing, not logic:
**🟢 LIVE MODE**: real-time IR ingestion. Layer C enforced strictly. sandbox routing enabled.
**🧪 SANDBOX MODE**: all transitions forced through sandbox policy. no production state mutation allowed.
**🔁 REPLAY MODE**: IR_EventEnvelope stream is deterministic input. Layer C can be toggled (strict replay vs audit replay).

## 🧠 DESIGN GUARANTEE
✔ Determinism: Same input batch → same KernelResult
✔ Separation of concerns: Each layer has single responsibility
✔ Replay safety: Kernel never mutates interpretation logic
✔ Policy isolation: Layer C is the only authority gate
✔ IR Compiler Frontend Separation: System entry points (main) only build structures and delegate here.
