>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# Requirements-Capture Boundary Specification v1 — Control-Plane Isolation

## 0. Problem

Systems drift toward:

```
intent interpretation → requirements capture → execution shaping
```

This quietly turns `requirements-capture` into a **shadow control plane**.

The architecture must enforce:

```
normalize-intent (CONTROL)
        ↓
ExecutionState  ← FINAL authority
        ↓
mode-router
        ↓
execution pipeline
        ↓
requirements-capture (DOMAIN MODELING ONLY)
```

---

## 1. Canonical Definition

**requirements-capture**: A deterministic domain-model construction subsystem that transforms user interaction history into a WorkRequestGraph **without interpreting execution intent**.

### Non-Negotiable Rule

`requirements-capture` **never** decides *how* execution happens. It only decides *what work exists*.

---

## 2. Formal Responsibility Matrix

| Responsibility | Owner |
|---|---|
| Intent parsing | `normalize-intent` |
| Validity resolution | `normalize-intent` |
| Mode selection | `mode-router` |
| Execution authority | Execution pipeline |
| Work decomposition | `requirements-capture` |

---

## 3. Allowed Inputs

`requirements-capture` **MAY** consume:

- conversation history
- artifacts
- prior execution events
- domain context
- user requirements statements

It **MAY** read `ExecutionState` as a read-only context.

It **MAY NOT** consume:

- `PIPELINE_INTENT.yaml`
- routing configuration
- mode selection logic
- `ExecutionState` mutation authority

**Critical**: `ExecutionState` is `readonly` to `requirements-capture`. It may **never** modify, reinterpret, derive, or replace `ExecutionState`.

---

## 4. Allowed Outputs

`requirements-capture` may emit **only**:

- `WorkRequestGraph`
- `RequirementEvents`
- `RequirementAnnotations`

It **MUST NOT** emit:

- routing hints
- execution modes
- validator directives
- pipeline stage decisions

---

## 5. Forbidden Behaviors (Hard Constraints)

### F1 — No Intent Inference

`requirements-capture` MUST NOT infer:
- autonomy level
- safety mode
- execution mode
- routing preference

*Example violation*: "User asked vaguely → assume exploratory mode" — **illegal**. Only `normalize-intent` may do this.

### F2 — No Structural Execution Influence

It MUST NOT:
- choose validators
- change execution order
- inject execution stages
- alter pipeline topology

### F3 — No Control Feedback

`requirements-capture` MUST NOT cause a reverse dependency:

```
ExecutionState ← requirements-capture output
```

`ExecutionState` is immutable to this subsystem. No feedback loop allowed.

---

## 6. Data Flow Contract

### Correct Flow

```
User Input
   ↓
normalize-intent
   ↓
ExecutionState (readonly)
   ↓
mode-router
   ↓
execution pipeline
   ↓
requirements-capture
   ↓
WorkRequestGraph
```

### Forbidden Flow

```
requirements-capture
      ↓
 reinterpret intent
      ↓
 change routing
```

This is the exact failure mode being prevented.

---

## 7. Enforcement Mechanisms

### E1 — Type Isolation

`ExecutionState` is `readonly` to `requirements-capture`. The system must enforce that `requirements-capture` cannot construct, mutate, or derive `ExecutionState`.

### E2 — Dependency Direction

```
Allowed:   requirements-capture → execution types
Forbidden: requirements-capture → control-plane modules
```

`requirements-capture` must not import or reference `normalize-intent`, `mode-router`, or any control-plane module.

### E3 — Validator Guard

`executiongraph-validator` MUST reject a `WorkRequestGraph` that contains:
- routing metadata
- requirement objects with execution flags
- embedded execution mode selections

### E4 — Audit Rule

Any document describing `requirements-capture` as:
- "intent resolution"
- "planning authority"
- "execution selection"

→ **automatically invalid architecture**.

---

## 8. Mental Model

| Component | Question it answers |
|---|---|
| `normalize-intent` | *What kind of run is this?* |
| `mode-router` | *Where does it go?* |
| `requirements-capture` | *What work exists?* |

If any layer answers another layer's question → **architecture regression**.

---

## 9. System Property

After this boundary:

- Control plane cannot re-emerge accidentally
- Pipeline stages cannot mutate intent meaning
- Domain modeling remains powerful but safe
- Future orchestration layers remain composable

Result: a **provably one-directional architecture**.

---

## 10. Final Layer Architecture

```
CONTROL PLANE
  normalize-intent

ROUTING
  mode-router

EXECUTION
  execution pipeline

DOMAIN MODELING
  requirements-capture

OBSERVATION
  replay / OQL
```
