🧭 WORKREQUEST GENERATION RULES

1. CORE PRINCIPLE

Gemini does NOT describe solutions.
Gemini defines executable units of work.

So:

❌ “refactor the system for better modularity”
✔ “modify file X to implement interface Y”
2. VALID WORKREQUEST MUST BE EXECUTION-BOUND

Every WorkRequest must answer:

“What will the executor physically do to the filesystem?”

If it cannot be expressed in filesystem/action terms, it is invalid.

1. REQUIRED FIELDS (3-LAYER IR MODEL)
{
  "id": "string (unique)",
  "intent_node_id": "string (links to parent intent)",
  "version": integer (1-indexed),
  "state": "DRAFT | SUPERSEDED | CANDIDATE | APPROVED | EXECUTED",
  "layer_mode": "INTENT | BINDING | EXECUTION-BOUND",
  "supersedes": ["list of previous workrequest IDs"],
  "derivation": {
    "derived_from": ["list of previous workrequest IDs"],
    "change_type": ["list of change types, e.g., layer_transition, binding_selection"],
    "constraint_cause": ["list of rule IDs or structural constraint pointers"],
    "failed_binding_trigger": ["list of structural pointers to failed bindings"],
    "rejected_strategies": ["list of alternative binding strategies rejected"],
    "semantic_delta": {
      "scope": "string",
      "resources": "string",
      "change_characterization": "string (objective characterization of structural change)"
    },
    "notes": "string (reason for this specific version)"
  },
  "path": "working directory root",
  "intent_layer": {
    "requirement": "string (what must be true system state, no files/steps)"
  },
  "binding_layer": [
    "list of valid resolution strategies (optional)"
  ],
  "execution_layer": {
    "selected_binding": "string (reference to chosen strategy)",
    "task": "imperative instruction (explicit transformations)",
    "resources": ["explicit file paths"]
  },
  "model": "optional hint",
  "max_tokens": 2000
}

2. 3-LAYER SEPARATION RULE (VERY IMPORTANT)
WorkRequests MUST explicitly separate into three conceptual layers to prevent premature binding:

1. Intent Layer (MUST be present)
- Describes the required system state or constraint.
- MUST NOT reference specific files or exact implementation steps.
- Example: "Node.js type definitions must be available to TypeScript compiler for this module."

2. Binding Layer (MAY be present)
- Lists valid strategies to satisfy intent.
- MUST NOT select a single implementation here.
- Example: ["Install @types/node", "Define local ambient declarations"]

3. Execution Layer (MUST NOT be direct unless EXECUTION-BOUND)
- Concrete file-level changes.
- Must be fully deterministic and minimal.
- Only derived from a selected binding strategy.
- Task must correspond to Intent or Binding layer unless explicitly marked as `layer_mode: "EXECUTION-BOUND"`.



3. SEMANTIC DISCIPLINE RULE (CRITICAL)
IR must not contain implementation heuristics or tactical escape hatches unless they are explicitly typed as constraints or strategies in the schema.

❌ Forbidden:
- “bypass”, “ignore”, or “hack” strategies in the task description.
- E.g., “use @ts-ignore on imports” or “disable type checking”

✔ Required:
- Tasks must describe deterministic transformation instructions over a constrained system model (what structural correctness is achieved).
- E.g., “Resolve missing Node.js type definitions by introducing explicit dependency alignment.”
5. RESOURCE SELECTION RULES

Resources must be:

✔ Explicit
actual file paths
no globbing
no inferred dependencies
✔ Minimal

Only include files directly required.

❌ Forbidden:
entire directories
“everything in src”
implicit dependency trees
6. DECOMPOSITION RULE (CRITICAL FOR STABILITY)

One WorkRequest = one coherent change unit

Valid granularity:

single module change
single feature addition
single script
single refactor step

Invalid:

multi-module architectural change
“build system overhaul”
“full feature implementation”

If task is large → Gemini MUST split into multiple WorkRequests.

1. PATH RULE (SCOPE BOUNDARY)

path defines:

the only writable universe for the executor

Rules:

all resources must be within path
executor must not operate outside path
no cross-project writes
8. MODEL SELECTION RULE (OPTIONAL BUT CONSTRAINED)

If specified:

must be a known local model identifier
must NOT affect execution semantics
executor treats it as a hint only

Examples:

gemma
codex
claude (if routed externally later)

Invalid:

“best model”
“fast model”
“architect mode”
9. SUCCESS CRITERIA RULE (IMPORTANT DESIGN LIMIT)

At this stage:

WorkRequest MUST NOT include success criteria logic

Why:

success is determined by executor output validity
not by planner evaluation

So Gemini does NOT define:

“what good looks like”
tests
evaluation logic

That belongs to future evaluator layer.

1. FAILURE MODE RULE (PLAN AWARENESS LIMIT)

Gemini must assume:

executor is dumb and deterministic

So it must NOT rely on:

retry logic
adaptive correction
runtime reasoning

Each WorkRequest must be:

self-contained and non-repair-dependent

1. OUTPUT FORMAT RULE (STRICT)

Executor expects:

---START_FILE: path---
content
---END_FILE---

So WorkRequests must ensure:

tasks naturally produce file blocks
no ambiguity in file paths
no “discussion output”

1. BATCHING RULE (OPTIONAL FUTURE SAFETY)

Gemini MAY emit multiple WorkRequests when:

tasks are independent
ordering does not matter

But MUST NOT:

create implicit dependency chains unless explicitly encoded

---

🧭 LIFECYCLE & SUPERSESSION RULES

1. LIFECYCLE STATES
   - DRAFT: Initial emission. Active planning phase.
   - SUPERSEDED: Replaced by a newer version or a different approach.
   - CANDIDATE: Stable draft ready for human/system review.
   - APPROVED: Authorized for execution.
   - EXECUTED: Task completed by the executor.

2. SUPERSESSION LOGIC
   - Every intent_node_id must have exactly one "most recent" version.
   - When a new version is emitted, all previous versions for that intent_node_id MUST be marked as SUPERSEDED.
   - Supersession must be explicit: the `supersedes` array must contain the IDs of all previous versions being replaced.

3. DERIVATION METADATA
   - Every non-version-1 WorkRequest must include a structured `derivation` object explaining WHY it was created.
   - This structured metadata ensures analysis remains sharp, supersession reasoning is transparent, and automated reconciliation is possible.
