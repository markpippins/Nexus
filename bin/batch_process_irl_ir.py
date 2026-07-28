#!/usr/bin/env python3
"""
Batch-process 'IRL IR Interaction System' (ChatGPT transcript).

Content map (from offline markdown analysis + chunk previews):
  Chunk 0: sidebar/nav — NOISE
  Chunk 1: Spec taxonomy listing (attachment) — CONTENT A (file catalog)
  Chunk 2: Spec taxonomy continuation — CONTENT A
  Chunk 3: Spec taxonomy continuation — CONTENT A
  Chunk 4: nav duplicates — NOISE
  Chunk 5: User message start — CONTENT B
  Chunk 6-14: Spec catalog continuation — CONTENT A (reference data)
  Chunk 15: ChatGPT response: IRL↔IR bridge, 5-phase pipeline — CONTENT C
  Chunk 16: ChatGPT response: architectural tension — CONTENT D
  Chunk 17: Roadmap: collapse plan, vertical slice — CONTENT E
  Chunk 18: MEEP definition, code bootstrap — CONTENT F
  Chunk 19: MEEP v0.1 implementation code — CONTENT G
  Chunk 20: MEEP v0.2 golden trace + test harness — CONTENT H
"""
import asyncio
import json
from mcp import ClientSession
from mcp.client.sse import sse_client

JOB_ID = "d8665023"
SERVER_URL = "http://localhost:3102/sse"

# CONTENT A: Spec taxonomy / file catalog (the attachment)
CONTENT_A = {
    "agenda_items": [
        {
            "title": "Comprehensive Spec Catalog — Current System State Inventory",
            "status": "Agreed",
            "intent_description": "A complete catalog of existing specification files, taxonomy documents, and architecture references across the Nexus system. Includes IRL/IR taxonomies, compiler specs, runtime docs, CER/identity specs, validator definitions, and architecture analyses. This is a reference inventory, not a proposal.",
            "requirements": [
                "Must be maintained as an accurate inventory of all spec files in the system",
                "Must track file relationships and cross-references between specs"
            ],
            "implementation_notes": [
                "This catalog was posted as an attachment by the user to give context",
                "It reveals the full scope of existing specifications vs implemented code",
                "Uses include: IRL taxonomy (8 probabilistic), IR taxonomy (9 deterministic), compiler phases, runtime, CER, validator, observation, distributed scheduler"
            ],
            "code_snippets": [],
            "open_questions": [
                "Should this catalog be maintained as a living document?",
                "How does it relate to the existing CROSS_REFERENCES.md?"
            ]
        }
    ]
}

# CONTENT B: User message kicking off the thread
CONTENT_B = {
    "agenda_items": [
        {
            "title": "IRL (Interaction Reasoning Layer) and IR Interaction Archetypes — Canonical Definitions",
            "status": "Agreed",
            "intent_description": "IRL is a probabilistic, constraint-aware semantic classification layer that answers 'what kind of interaction is this?' using 8 probabilistic archetypes. It is Layer A of the three-layer system. IR Interaction Archetypes are a closed contract governing how the deterministic Append-Only Object Registry (IR) is permitted to evolve, with 9 deterministic archetypes: Construction, Execution, Reflection, Reconciliation, Revision, Counterfactual, Audit, Compression, Constraint Injection.",
            "requirements": [
                "IRL must use probabilistic archetypes (8) — soft classification",
                "IR must use deterministic archetypes (9) — closed contract",
                "IRL and IR are companions: IRL→IR selection must bridge probabilistic→deterministic"
            ],
            "implementation_notes": [
                "IRL probabilistic, IR deterministic — this pairing is the core insight",
                "The IRL↔IR bridge is the missing unifier in the system architecture"
            ],
            "code_snippets": [],
            "open_questions": [
                "What are the exact 8 IRL archetypes?",
                "What are the exact 9 IR archetypes beyond the names listed?"
            ]
        }
    ]
}

# CONTENT C: IRL↔IR bridge + 5-phase pipeline + 4 invariants
CONTENT_C = {
    "agenda_items": [
        {
            "title": "Define IRL↔IR Bridge: Bayesian Observer Meets Type System",
            "status": "Agreed",
            "intent_description": "The relationship between IRL and IR is: IRL = Bayesian observer over interaction space (probabilistic classification: soft labels), IR = type system over interaction space (deterministic archetype selection: hard constraint). The pipeline flows: User Input → IRL probabilistic classification → Interaction Taxonomy Resolver → IR deterministic archetype selection → Authority Graph mutation rules. Key invariant: IRL never decides structure. It only proposes probability mass over IR types.",
            "requirements": [
                "IRL must produce probability distribution over IR archetypes — never a single answer",
                "IR must enforce closed-contract deterministic selection from IRL's proposals",
                "IRL must never directly decide structure or mutation rules",
                "The bridge must preserve the 'closed contract' property of IR"
            ],
            "implementation_notes": [
                "This is the uncertainty buffer between language and structure",
                "Before IRL/IR, the system assumes 'we already know what kind of interaction this is'",
                "IRL adds: probabilistic ambiguity handling BEFORE commitment",
                "Enables: soft classification of intent drift, multi-hypothesis WorkRequest generation, better routing into compiler front-end"
            ],
            "code_snippets": [],
            "open_questions": [
                "What is the exact mapping between IRL probabilistic archetypes and IR deterministic archetypes?",
                "How is the probability threshold for IR selection determined?"
            ]
        }
    ]
}

# CONTENT D: 5-phase pipeline + architectural tension
CONTENT_D = {
    "agenda_items": [
        {
            "title": "Establish 5-Phase Pipeline Architecture with Freeze Boundary",
            "status": "Agreed",
            "intent_description": "The system is a 5-phase pipeline (revised from earlier 3-phase model): Phase 0 (IRL/IR — interaction semantics layer), Phase 1 (Spec Compiler — prompt→WorkRequestGraph), Phase 1.5 (Lowering Pass — freeze boundary), Phase 2 (Execution Runtime — deterministic scheduler + CER), Phase 3 (Observation Model — projections + replay), with Phase 4 (Identity/Persistence — cross-cutting CER + entity_key). Four invariants unify everything: (A) Determinism, (B) Append-only truth model, (C) Freeze boundary, (D) Identity collapse.",
            "requirements": [
                "Phase 0: IRL probabilistic classification → IR deterministic selection",
                "Phase 1: Prompt → WorkRequestGraph via structural decomposition",
                "Phase 1.5: WorkRequestGraph → Frozen ExecutionGraph (topology immutable after lowering)",
                "Phase 2: Deterministic scheduler + CER event emission + append-only log",
                "Phase 3: Projection layer + replay + derived views (read-only, never affects execution)",
                "Phase 4: Append-only log integrity + identity collapse + deterministic replay + snapshot compression",
                "IRL must never decide structure — only propose probability mass"
            ],
            "implementation_notes": [
                "This is a complete semantic stack: fluid meaning → hard structure → frozen execution → replayable truth → re-interpretation",
                "Architectural tension: IRL wants fluidity, IR wants closure, compiler wants determinism, scheduler wants freeze, observation wants re-interpretation, CER wants permanence",
                "WorkRequestGraph = AST, ExecutionGraph = bytecode, CER = syscall trace, Scheduler = VM"
            ],
            "code_snippets": [],
            "open_questions": [
                "Is Phase 1.5 truly its own phase or should it be part of Phase 1?",
                "How does the 5-phase model relate to the existing losm-ir state machine?"
            ]
        }
    ]
}

# CONTENT E: Roadmap — collapse plan
CONTENT_E = {
    "agenda_items": [
        {
            "title": "Adopt Collapse Plan Roadmap — Stop Expanding, Build Spine",
            "status": "Agreed",
            "intent_description": "The system is over-modeled and under-steered. The roadmap must be structural, not aspirational. Phase 0: Stop expanding the ontology (no new specs, taxonomies, layers, or archetype expansions unless they map to executable surface). Phase 1: Vertical slice exists (one end-to-end pipeline that runs a trivial prompt all the way to replayable event log — single node, no distribution, no observation). Phase 2: Compiler hardening (deterministic, testable). Phase 3: Execution as kernel (runtime as pure interpreter). Phase 4: Observation layer (only after correctness exists). Phase 5: Distribution (optional, last). Correct dependency direction: IRL→IR→Compiler→Execution→CER→Replay→Observation→Distribution.",
            "requirements": [
                "Phase 0: Freeze conceptual growth — fixed contract set only",
                "Phase 1: Vertical slice must work end-to-end on single node before anything else",
                "Phase 2: IRL output must become structured vector, IR selection deterministic, WorkRequestGraph schema-validated AST",
                "Phase 3: ExecutionGraph as immutable bytecode, scheduler as interpreter loop, CER as syscall log",
                "Phase 4: Observation must NEVER affect execution (read-only semantics over immutable truth)",
                "Phase 5: Distribution last — replay engine replicated across machines"
            ],
            "implementation_notes": [
                "No new spec documents unless they map to an executable surface",
                "Phase 1 success condition: You can delete runtime state and reconstruct everything from CER log",
                "The 'no enforced execution spine yet' problem is the critical blocker",
                "You need three artifacts: (1) Minimal End-to-End Pipeline Repo, (2) Golden Trace Spec, (3) Validator Gate Rewrite"
            ],
            "code_snippets": [],
            "open_questions": [
                "What are the exact boundaries of the fixed contract set?",
                "Should the MEEP live in nexus/ or as a separate repo?"
            ]
        }
    ]
}

# CONTENT F: MEEP definition + repo structure
CONTENT_F = {
    "agenda_items": [
        {
            "title": "Build Minimal End-to-End Pipeline (MEEP) Bootstrap Implementation",
            "status": "Proposed",
            "intent_description": "The MEEP is a single repo that takes a prompt and produces a replayable CER log that deterministically reconstructs execution. Repo structure: cli/ (entrypoint), irl/ (probabilistic intent vector), ir/ (deterministic resolver), compiler/ (spec compiler + lowering pass), runtime/ (executor + scheduler), cer/ (event log + grammar + writer), replay/ (engine + projector), validation/ (single gate + codes), examples/ (prompts). Core data models: WorkRequestGraph (WorkRequestNode with id/type/inputs/deps), ExecutionGraph (frozen ExecutionNode with id/op/inputs/deps), CER Event (id/timestamp/type/node_id/payload), Identity (entity_key = sha256(canonical_string(node))).",
            "requirements": [
                "Determinism: same prompt → same CER log → same replay state",
                "Append-only CER: event_log.append(event), NEVER modify or delete",
                "Freeze boundary: WorkRequestGraph → ExecutionGraph = immutable transition",
                "No distributed logic in v1",
                "Single validator gate: validate(artifact, phase) → pass/fail + reason codes"
            ],
            "implementation_notes": [
                "Build order (strict sequence): CLI skeleton → hardcoded IRL→IR → fake compiler → lowering → dummy executor → CER log → replay engine → replace fake compiler with real logic",
                "Forbidden in v1: distributed scheduler, snapshot system, observation model, full IRL probabilistic model, CER compression, multi-host replay, advanced validator taxonomy, ontology expansion",
                "The key mental shift: from 'a complete theoretical machine' to 'a single executable loop with traceability guarantees'"
            ],
            "code_snippets": [],
            "open_questions": [
                "Should MEEP be implemented in nexus/ directly or as a separate repository?",
                "What is the first golden trace prompt?"
            ]
        }
    ]
}

# CONTENT G: MEEP v0.1 code bootstrap
CONTENT_G = {
    "agenda_items": [
        {
            "title": "Implement MEEP v0.1 Bootstrap — Runnable Code Skeleton",
            "status": "Actionable",
            "intent_description": "A minimal working system with zero external dependencies (except dataclasses-json). Includes: heuristic IRL classifier (keyword-based), deterministic IR resolver (argmax), rule-based spec compiler, freeze lowering pass, deterministic simulator executor, append-only JSONL CER writer, and pure-function replay engine. All code was provided inline in the transcript.",
            "requirements": [
                "CLI entrypoint: python cli/main.py \"prompt\"",
                "IRL classifier: keyword-based heuristic returning probability dict",
                "IR resolver: argmax over IRL probabilities",
                "Spec compiler: returns WorkRequestGraph with 2 nodes (A=type, B=validate)",
                "Lowering: freezes graph with tuple deps",
                "Executor: deterministic loop producing NODE_START/NODE_COMPLETE events",
                "CER writer: append to cer.log with UTC timestamps",
                "Replay engine: pure reducer from events to state dict",
                "Proven: deterministic pipeline spine, append-only event log, replayable state, freeze boundary, IRL→IR→execution flow exists"
            ],
            "implementation_notes": [
                "IRL is heuristic (not ML) — intentionally simple for v0.1",
                "No framework dependencies — pure Python standard library",
                "This is the first real Nexus system, not a specification",
                "cer.log grows with every run — append-only by design"
            ],
            "code_snippets": [],
            "open_questions": [
                "Should this code live in nexus/ directly or as a separate protip?",
                "When should heuristic IRL be replaced with a real probabilistic model?"
            ]
        }
    ]
}

# CONTENT H: MEEP v0.2 — Golden Trace + Test Harness
CONTENT_H = {
    "agenda_items": [
        {
            "title": "Implement Golden Trace Regression Harness (MEEP v0.2)",
            "status": "Proposed",
            "intent_description": "Add deterministic verification layer on top of MEEP v0.1. Golden trace format captures expected_irl, expected_ir, expected_execution_nodes, expected_final_state as a JSON behavioral contract. Comparison engine (golden_compare.py) diffs actual vs expected state. Test runner executes pipeline and compares against golden trace. No external test framework required.",
            "requirements": [
                "Golden trace must capture full expected pipeline output as JSON",
                "Comparison engine must detect FINAL_STATE_MISMATCH, IR_MISMATCH, etc.",
                "CAPTURE function must record reality first, then become expected",
                "New invariant: NO CHANGE IS VALID UNLESS IT PASSES GOLDEN TRACE REPLAY",
                "Test runner must assert pass/fail with error list"
            ],
            "implementation_notes": [
                "This turns the system from 'a pipeline that runs prompts' into 'a system whose behavioral state is version-controlled'",
                "Regression detection: IRL changes become testable diffs, compiler changes become regression risks",
                "This is the real 'system contract' — not the specs, not the taxonomy, not the architecture docs",
                "Natural next steps after this: IRL structured vector model, formalized execution DAG, strict validator gates"
            ],
            "code_snippets": [],
            "open_questions": [
                "Should golden traces be stored in the repo or generated on first run?",
                "How many golden traces are needed for adequate regression coverage?"
            ]
        }
    ]
}

EMPTY = {"agenda_items": []}

EXTRACTIONS = {
    # Content chunks
    1: CONTENT_A,    # Spec catalog
    2: CONTENT_A,    # Spec catalog
    3: CONTENT_A,    # Spec catalog
    5: CONTENT_A,    # Actually this is user message with context — reuse A
    6: CONTENT_A,    # Spec catalog
    7: CONTENT_A,    # Spec catalog
    8: CONTENT_A,    # Spec catalog
    9: CONTENT_A,    # Spec catalog
    10: CONTENT_A,   # Spec catalog
    11: CONTENT_A,   # Spec catalog
    12: CONTENT_A,   # Spec catalog
    13: CONTENT_A,   # Spec catalog
    14: CONTENT_A,   # Spec catalog
    15: CONTENT_C,   # IRL↔IR bridge + pipeline
    16: CONTENT_D,   # 5-phase + tension
    17: CONTENT_E,   # Roadmap
    18: CONTENT_F,   # MEEP definition
    19: CONTENT_G,   # MEEP code
    20: CONTENT_H,   # Golden trace
}

async def submit_extraction(session, job_id, chunk_index, agenda):
    result = await session.call_tool("rover_submit_extraction", {
        "job_id": job_id,
        "chunk_index": chunk_index,
        "agenda_json": json.dumps(agenda),
    })
    return json.loads(result.content[0].text)

async def main():
    async with sse_client(url=SERVER_URL) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()

            for chunk_idx in range(21):
                result = await session.call_tool("rover_get_pending_chunk", {
                    "job_id": JOB_ID,
                })
                data = json.loads(result.content[0].text)
                if data.get("done"):
                    print("Server says done early — unexpected.")
                    break
                idx = data["chunk_index"]
                remaining = data["pending_count"]

                if idx in EXTRACTIONS:
                    agenda = EXTRACTIONS[idx]
                    resp = await submit_extraction(session, JOB_ID, idx, agenda)
                    items = len(agenda["agenda_items"])
                    print(f"[{remaining-1:>2} remaining] Chunk {idx:>2}: submitted {items} item(s) — CONTENT")
                else:
                    resp = await submit_extraction(session, JOB_ID, idx, EMPTY)
                    print(f"[{remaining-1:>2} remaining] Chunk {idx:>2}: submitted 0 items — NOISE/DUPLICATE")

                if resp.get("remaining_chunks", 1) == 0:
                    print("\n→ All chunks processed!")

            result = await session.call_tool("rover_job_status", {"job_id": JOB_ID})
            print(f"\nFinal status: {result.content[0].text}")

asyncio.run(main())
