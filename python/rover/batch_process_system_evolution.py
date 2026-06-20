#!/usr/bin/env python3
"""Batch-process System Evolution and Naming transcript."""
import asyncio
import json
from mcp import ClientSession
from mcp.client.sse import sse_client

JOB_ID = "47e360e5"
SERVER_URL = "http://localhost:3102/sse"

# Content A: WDICC Spec (chunk 7/8)
WDICC_EXTRACTION = {
    "agenda_items": [
        {
            "title": "Implement WorkRequest DAG Ingestion and Constraint Compilation (WDICC)",
            "status": "Proposed",
            "intent_description": "Define the minimal executable pipeline for converting raw transcript + NBK harvest output into structured WorkRequest DAGs with constraint enforcement. Formalizes the transformation boundary between unstructured cognitive artifacts (transcripts, speculative plans) and structured execution artifacts (WorkRequest DAGs compatible with NBK). All ambiguity must be either structurally resolved or explicitly preserved as constraints — never left implicit.",
            "requirements": [
                "No actionable artifact may exist without explicit structural classification into: Node, Edge, Constraint, or Rejection",
                "TranscriptUnit must be atomic immutable input: {id, timestamp?, source, content}",
                "NBKHarvest must produce: node_candidates, edge_candidates, speculative_claims, objections — all non-executable until compiled",
                "WorkRequestNode must have: id, intent, inputs, outputs, constraints, status (DRAFT|CONSTRAINED|COMPILABLE|EMITTED|INVALID)",
                "WorkRequestEdge must have: from, to, type (DEPENDS_ON|PRODUCES|VALIDATES|CONSTRAINS)",
                "Constraints must be first-class executable rules with: id, type, condition, severity (ERROR|WARNING|INFO), source, message",
                "Constraint types must include: structural_invariant, boundary_guard, coherence_rule, compilation_guard",
                "CompilationRuleSet must define: compilation_strategy (AGGRESSIVE|CONSERVATIVE|MANUAL), validation_mode (STRICT|PERMISSIVE|DEFERRED), default_constraint_severity",
                "RejectionProtocol must produce: rejected_artifact_id, reason, constraint_violations, suggested_remediation"
            ],
            "implementation_notes": [
                "All interpretation forms are disallowed at persistence time except the four structural classifications",
                "TranscriptUnits are immutable and never modified after ingestion",
                "NBKHarvest candidates are intermediate — must be compiled into WorkRequest structures before execution",
                "The constraint system turns objections and invariants into executable rules",
                "This spec sits between Rover harvesting and NBK execution as a compilation step"
            ],
            "code_snippets": [],
            "open_questions": [
                "Should compilation be eager (compile all on ingestion) or lazy (compile on demand)?",
                "How should constraint violations discovered late in execution be handled — retroactive rejection or deferral?",
                "What is the exact schema for ArtifactRef in WorkRequestNode inputs/outputs?"
            ]
        }
    ]
}

# Content B: Operational Checkpoint Analysis (chunk 9)
CHECKPOINT_EXTRACTION = {
    "agenda_items": [
        {
            "title": "Stabilize NBK as Execution-Only Kernel and Enforce Semantic Compiler Separation",
            "status": "Agreed",
            "intent_description": "The system is currently at a Partial Compilation + Pre-Verification Lock stage: structure has been generated (candidate plan exists), execution semantics have been applied (NBK is involved), but nothing is yet committed as canonical DAG state. Three actionable levers exist: (A) Stabilize NBK correctness boundary — verify invariants hold, no semantic leakage from rover, lease/trace/address unchanged; (B) Validate LOSM→NBK translation fidelity — ensure chunks are interpreted as nodes or constraints, not speculative narrative; (C) Candidate DAG sanity check — check for cycle emergence, orphan nodes, and over-aggregation.",
            "requirements": [
                "NBK must be frozen — no structural changes, no rule mutation, no SOCO application until verification passes",
                "Every candidate plan item must be strictly classified as: NODE (executable unit), CONSTRAINT (invariant rule), REJECT (invalid), or DEFER (needs more data)",
                "NBK must NOT interpret meaning, resolve ambiguity, or hold semantic state — it is execution-only",
                "Semantic IR must be defined as a strict intermediate representation before any integration proceeds",
                "NBK integration with cascade/replay kernel must NOT proceed until a stable post-harvest DAG exists",
                "Rover must be restructured to emit typed artifacts: SemanticNode, WorkRequestEdge, Constraint, Objection — not speculative text"
            ],
            "implementation_notes": [
                "Stage: Partial Compilation + Pre-Verification Lock",
                "Pipeline: Transcript → Rover MCP → LOSM extraction → NBK compilation → candidate DAG → validation pending → integration pending",
                "The real bottleneck is: when does a harvested object become a canonical node vs a transient interpretation? This decision is currently implicit in Rover",
                "Three-layer architecture: Layer 1 = Kernel (NBK: nodes, edges, trace, lease, address), Layer 2 = Semantic Compiler (Semantic IR, LOSM core, risk management, dual-mode OS), Layer 3 = Projection & Validation (SemanticProjection, determinism checks, replay views, dashboards)",
                "Hard rule: Only NBK defines execution truth. Semantic IR defines meaning. Everything else is derived."
            ],
            "code_snippets": [],
            "open_questions": [
                "Should the WDICC compilation spec be implemented before or after Semantic IR is defined?",
                "How should the three-layer architecture be reflected in the filesystem/repository layout?"
            ]
        }
    ]
}

# Content C: Three-Layer Convergence Analysis (chunk 13)
CONVERGENCE_EXTRACTION = {
    "agenda_items": [
        {
            "title": "Restructure Rover to Emit Typed Artifacts Instead of Speculative Text",
            "status": "Proposed",
            "intent_description": "Rover currently mixes semantic truth model (IR), execution system (NBK), validation system (risk/determinism), and UI projection (SemanticProjection) into a single output stream. It must be restructured to emit strictly typed artifacts: SemanticNode, WorkRequestEdge, Constraint, and Objection — not speculative narrative text. This prevents the system from having 'multiple competing truths encoded as equal systems.'",
            "requirements": [
                "Rover output must distinguish between: Node (executable unit), Edge (dependency/production/validation/constraint), Constraint (invariant rule from objection), and Objection (rejected or deferred item)",
                "Narrative-shaped output must be rejected as uncompiled",
                "Rover must support a compilation mode that enforces the typed artifact schema at harvest time, not post-hoc",
                "The transformation from Rover's current text output to typed artifacts must be a deterministic compilation step, not a second LLM pass"
            ],
            "implementation_notes": [
                "The 5 LOSM harvest candidates actually represent 3 real kernels + 2 derivative concerns:",
                "Core semantic kernel expansion: Semantic IR (meta-model unification), LOSM dual-mode OS (execution topology), structural risk management (compile-time safety)",
                "Direct NBK extensions: SemanticProjection (view layer over IR), determinism layers (verification framework)",
                "Three immediate implementation decisions: (A) Define Semantic IR as strict IR, (B) Lock NBK as execution-only kernel, (C) Restructure Rover output",
                "Semantic IR must answer: what is a Concept, ResolveEdge, Trajectory, and provenance minimal form?"
            ],
            "code_snippets": [],
            "open_questions": [
                "Should Rover be extended to emit typed artifacts directly, or should a separate compilation step (WDICC) sit between Rover and NBK?",
                "What is the minimal schema for Semantic IR (Concept, ResolveEdge, Trajectory, provenance)?",
                "How does the three-layer architecture map to the existing nexus/python/ directory structure?"
            ]
        }
    ]
}

EMPTY = {"agenda_items": []}

EXTRACTIONS = {
    7: WDICC_EXTRACTION,       # WDICC spec (first occurrence)
    9: CHECKPOINT_EXTRACTION,  # Operational checkpoint analysis
    13: CONVERGENCE_EXTRACTION, # Three-layer convergence analysis
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

            for chunk_idx in range(0, 14):
                result = await session.call_tool("rover_get_pending_chunk", {"job_id": JOB_ID})
                data = json.loads(result.content[0].text)
                if data.get("done"):
                    print("Server says done early.")
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
