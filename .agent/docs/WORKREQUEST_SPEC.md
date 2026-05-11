WORKREQUEST_SPEC.md

Nexus WorkRequest Intermediate Representation (IR) Specification
Version: 0.1 (Draft)

1. Purpose

A WorkRequest is the canonical Intermediate Representation (IR) of the Nexus system.

It represents a unit of executable intent that has been:

separated from conversational context,
structured for deterministic reasoning,
versioned independently of any model session,
and made executable by downstream actors.

A WorkRequest is not a prompt, not a task, and not an implementation.

It is the stable compilation boundary between intent and execution.

1. Design Principles
2.1 Session Independence

WorkRequests must remain valid outside the model session that produced them.

No field may rely on:

chat history,
hidden reasoning,
ephemeral agent memory.
2.2 Deterministic Reconstruction

A WorkRequest must allow a new agent or human to reconstruct:

why work exists,
what constraints apply, and
how execution was selected.
2.3 Non-Destructive Evolution

WorkRequests are never edited in place.

Changes create new versions linked through:

supersedes → derived_from

History is preserved as a causal chain.

2.4 Layer Separation (Core Rule)

Nexus enforces a 3-Layer IR Model:

Layer Responsibility
Intent System truth or invariant requirement
Binding Valid solution space
Execution Selected concrete transformation

Premature binding is prohibited.

1. Conceptual Model
Human Intent
      ↓
Prompt
      ↓
Agent Reasoning
      ↓
WORKREQUEST (IR)   ← Canonical Boundary
      ↓
Executor
      ↓
Code / Artifacts

The WorkRequest functions as the compiler IR between cognition and action.

1. WorkRequest Lifecycle
States
State Meaning
DRAFT Generated but not executed
READY Validated for execution
EXECUTED Applied by executor
SUPERSEDED Replaced by newer WorkRequest
REJECTED Invalid or abandoned
Lifecycle Flow
Generate → Refine → Validate → Execute → Record Outcome
2. Required Top-Level Fields
{
  "id": "string",
  "intent_node_id": "string",
  "version": number,
  "state": "DRAFT | READY | EXECUTED | SUPERSEDED | REJECTED",
  "layer_mode": "INTENT | BINDING | EXECUTION-BOUND",
  "supersedes": [],
  "derivation": {},
  "path": "string",
  "model": "string"
}
3. Derivation Block

The derivation block records semantic lineage.

"derivation": {
  "derived_from": [],
  "change_type": [],
  "constraint_cause": [],
  "failed_binding_trigger": [],
  "rejected_strategies": [],
  "semantic_delta": {},
  "notes": ""
}
Purpose

This block replaces implicit reasoning with explicit causal history.

It answers:

Why does this WorkRequest exist?

1. Layer Definitions
7.1 Intent Layer (Required)

Defines invariant system truth.

"intent_layer": {
  "requirement": "Node.js type definitions must exist."
}

Rules:

Must be implementation-agnostic.
Must survive technological changes.
Must not reference specific tools unless unavoidable.

Good Intent:

“Compilation must succeed.”
“Service must expose authenticated endpoint.”

Bad Intent:

“Install library X.”
7.2 Binding Layer (Optional but Preferred)

Enumerates valid solution space.

"binding_layer": [
  "Install @types/node",
  "Provide ambient declarations",
  "Adjust tsconfig resolution"
]

Rules:

Multiple bindings encouraged.
No execution decision yet.
Represents reasoned alternatives.
7.3 Execution Layer (Conditional)

Only allowed when:

layer_mode = "EXECUTION-BOUND"
"execution_layer": {
  "selected_binding": "...",
  "task": "...",
  "resources": []
}

Rules:

Must be concrete.
Must be verifiable.
Must be minimal.
8. Path Semantics

path defines execution scope.

It must resolve to a project root or subproject root determined by artifact detection:

Examples:

package.json
.git
pom.xml
pyproject.toml

Executors must never assume repository root implicitly.

1. Model Attribution
"model": "gemini-3.1-pro"

Purpose:

auditability,
reproducibility,
behavioral analysis.

The model is a compiler frontend, not an authority.

1. Execution Rules

Executors MUST:

Execute only the execution_layer.
Never reinterpret intent.
Never invent bindings.
Record outcome externally.

Executors are linkers, not planners.

1. Relationship to PROMPT_RECORDS & IMPLEMENTATION_PLAN_RECORD
Artifact Role
PROMPT_RECORDS Human ↔ Agent dialogue history
WORKREQUEST Canonical IR
IMPLEMENTATION_PLAN_RECORD Execution results

WorkRequests bridge cognition and implementation.

1. Failure Handling

If execution fails:

Mark WorkRequest unresolved.
Generate new WorkRequest version.
Return to Binding Layer.

Intent is never discarded.

1. Anti-Patterns
❌ Tactical Patching

Embedding fixes directly in prompts.

❌ Heuristic Execution

Using @ts-ignore style bypasses without binding justification.

❌ Session Coupling

Referencing conversational reasoning.

1. Expected Emergent Properties

When followed correctly:

Agents behave like compilers.
Humans regain architectural control.
Model swapping becomes trivial.
Work becomes replayable.
Systems converge toward determinism.
15. Philosophical Statement

Nexus treats software development as compilation of evolving intent.

A WorkRequest is not work itself.

It is the proof that work has been understood.

1. Future Extensions (Non-Normative)

Possible additions:

validation schema
dependency graphs between WorkRequests
execution verification signatures
automated binding search
multi-agent compilation passes
