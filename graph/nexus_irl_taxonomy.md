# Nexus Interaction Reasoning Layer (IRL) Taxonomy

**Status:** Binding Probabilistic Interpretation Contract
**Scope:** Acts as a constrained input to structural compilation, while execution eligibility remains a separate gating layer that never shares semantics directly.

## 1. Core Principle System Layering
This taxonomy operates as the initial pass within a strictly decoupled three-layer system isolating meaning, structure, and execution:

*   **Layer A — Semantic Archetype Classification (IRL):** Answers *"what kind of interaction is this?"* using probabilistic, constraint-aware interpretations.
*   **Layer B — Structural Compiler (InteractionClassifier / IR Engine):** Consumes labeled archetypes and computes deterministic structure (producing nodes, edges, constraints, `IR_EventEnvelope`). Answers *"what structure does this interaction induce?"* 
*   **Layer C — Execution Eligibility Gate:** Separately answers *"is this allowed to become action?"* Policy rules restrict eligibility strictly (e.g., ONLY pass downstream if derived from a `Delegated Request`, block all ambient opportunity signals).  

## 2. The 8 Probabilistic Interaction Archetypes

### 🧊 1. Context Declaration (NON-ACTIONABLE)
**Definition:** A description of an existing system, environment, or state ("we currently have X", "this is how things work today").
**Stabilization Role:** Explicitly limits scoping—prevents ambient conversation definitions from organically degrading into "latent work" or pending tasks.

### 🎯 2. Transformation Intent (ACTION-RELEVANT SIGNAL)
**Definition:** Explicit desire to change, improve, or build something ("we should migrate...", "let's build...").
**Stabilization Role:** Maps semantic directives cleanly into explicit transformation targets serving as Action Candidates.

### 🧪 3. Hypothetical / Simulation Frame (NON-REAL)
**Definition:** Exploratory or imagined systems ("what if we...", "imagine a system where...").
**Stabilization Role:** Completely sandboxes logic—prevents semantic simulation patterns from implicitly becoming committed operational intents.

### ⚠️ 4. Constraint / Blocker Signal
**Definition:** Represents limitations or required conditions (legal approval, budget limits, technical limitations).
**Stabilization Role:** Flags mandatory guard conditions that permanently halt triggers until safely fulfilled. 

### 📈 5. Opportunity Signal (UNBOUND POTENTIAL)
**Definition:** Detected inefficiency or pattern suggesting a possible improvement.
**Stabilization Role:** Categorizes unresolved optimizations statically—explicitly verifying they NEVER trigger execution pathways independently.

### ❓ 6. Ambiguity / Underspecification Signal
**Definition:** Missing information or unclear mapping.
**Stabilization Role:** Forces safety boundaries preserving uncertainty natively rather than probabilistically collapsing assumptions logically. 

### ❗ 7. Inconsistency / Violation Signal
**Definition:** Detected contradiction across prior context or constraints.
**Stabilization Role:** Diagnostic signaling exclusively warning downstream evaluation logic.

### 🧾 8. Delegated Request (EXPLICIT ACTION ELIGIBILITY)
**Definition:** Mandated explicit triggers matching exact execution directives ("build", "create", "write").
**Stabilization Role:** The ONLY archetype strictly unlocking boundaries providing a clean, explicit gate unlocking action eligibility into the downstream executing capabilities. 

---

## 3. Output Constraints
All IRL interactions must return the explicit hypothesis outputs adhering explicitly to:
1. Identifying strictly NO Execution boundaries autonomously.
2. Formally preserving absolute probabilistic uncertainty.
3. Decoupling Interpretations absolutely from active downstream execution scripts securely.
