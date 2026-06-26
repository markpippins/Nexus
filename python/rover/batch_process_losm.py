#!/usr/bin/env python3
"""
Batch-process LOSM transcript: submit structured extractions for distinct
content chunks, empty extractions for noise/duplicates.

Content map (determined from offline analysis):
  Chunk 0: sidebar/nav — already processed (empty)
  Chunk 1: SemanticProjection impl steps + Semantic IR analysis — CONTENT A
  Chunk 2: sidebar/nav duplicate — noise
  Chunk 3: duplicate of chunk 1 — noise
  Chunk 4: syllabus listing — noise
  Chunk 5: duplicate of chunk 1 — noise
  Chunk 6: "computational society" realization — CONTENT B (first occurrence)
  Chunk 7: duplicate of chunk 1 — noise
  Chunk 8: duplicate of chunk 6 — noise
  Chunk 9: duplicate of chunk 1 — noise
  Chunk 10: duplicate of chunk 6 — noise
  Chunk 11: duplicate of chunk 1 — noise
  Chunk 12-14: duplicate of chunk 6 — noise
  Chunk 15-18: same content as chunk 6 (formatted differently) — noise
  Chunk 19: "remove stale MaterializedReplayView" — duplicate of chunk 1 — noise
  Chunk 20: determinism discussion — CONTENT C
"""
import asyncio
import json
from mcp import ClientSession
from mcp.client.sse import sse_client

JOB_ID = "f75d35a2"
SERVER_URL = "http://localhost:3102/sse"

# CONTENT A: SemanticProjection + Semantic IR (chunk 1)
CONTENT_A_EXTRACTION = {
    "agenda_items": [
        {
            "title": "Implement SemanticProjection and SemanticProjectionBuilder",
            "status": "Proposed",
            "intent_description": "Replace MaterializedReplayView with SemanticProjection as the canonical semantic state surface. SemanticProjection accumulates resolved_concepts and resolves_edges from envelopes or graph mutations, preserves trajectory boundaries, and is reconstructible deterministically. The builder supports from_envelopes(envelopes) using current replay_kernel.py semantics (added_nodes→resolved_concepts, removed_nodes→removes from resolved_concepts, emitted_edges→appends resolve edges).",
            "requirements": [
                "SemanticProjection must have fields: resolved_concepts, resolves_edges",
                "SemanticProjectionBuilder must support from_envelopes(envelopes) constructor",
                "Added node in envelope must appear in resolved_concepts",
                "Removed node in envelope must be absent from resolved_concepts",
                "Emitted edges must be preserved in insertion order",
                "Multiple trajectories must remain distinguishable via per-trajectory projection shape"
            ],
            "implementation_notes": [
                "Stop importing MaterializedReplayView from replay_kernel.py",
                "Stop returning MaterializedReplayView(closures=...), return SemanticReplayResult or SemanticProjection instead",
                "Replace latest_view.closures.values() in context_assembler.py with semantic projection consumption",
                "Keep WorkingSet.resolved_concepts and WorkingSet.resolves_edges output behavior",
                "Context assembler must NOT depend on GraphState",
                "Remove stale duplicate MaterializedReplayView definition, keep only graph-state version (run_id, schema_version, final_graph_state)",
                "Verify graph replay tests still pass after refactor",
                "Run targeted tests: test_kernel_determinism.py, new semantic projection tests, import checks around diff_engine.py, replay_kernel.py, replay_engine.py, context_assembler.py",
                "Graph mutation vocabulary: decide if concept resolution uses existing graph mutation primitives or new semantic mutation wrappers",
                "Emit graph mutations for concept nodes and resolve edges in kernel lowering",
                "Add SemanticProjectionBuilder.from_graph_mutations(...) after mutation events carry enough semantic info",
                "Define interaction boundary rules, insert interaction chunks before trajectory detection"
            ],
            "code_snippets": [],
            "open_questions": [
                "Should concept resolution use existing graph mutation primitives or new semantic mutation wrappers?",
                "What are the exact interaction boundary rules for chunking?",
                "How does WorkflowIntent bridge semantic IR/projection into CCNF ExecutionRequest while keeping CCNF transport distinct from semantic extraction?"
            ]
        },
        {
            "title": "Define Semantic IR as the Canonical Semantic State",
            "status": "Agreed",
            "intent_description": "Establish Semantic IR (SemanticConcept, ResolveEdge, Trajectory, ProvenanceBundle, SemanticMutation) as the unified, lossless, replay-independent semantic state surface that replaces the three overlapping representations (replay kernel world, graph mutation world, semantic IR world) with a single canonical representation. SemanticProjection is the filtered view of Semantic IR for a specific purpose.",
            "requirements": [
                "Semantic IR must be deterministic and replayable even if envelopes or kernel change",
                "Semantic IR must unify all models (LLM, DSL interpreter, planner, reducer) under one semantic worldview",
                "SemanticProjection must be the 'view' of Semantic IR that WorkingSet consumes",
                "Every concept and edge must have provenance for full attribution",
                "Risk Blockers and Ambiguity Signatures must operate on Semantic IR, not raw text",
                "Semantic IR → WorkflowIntent → ExecutionRequest must be the syscall boundary"
            ],
            "implementation_notes": [
                "Semantic IR is to LOSM what SSA is to compilers, CRDT state is to distributed systems, MVCC snapshots are to databases",
                "Trajectory semantics preserve boundaries, ordering, provenance, status, and resolution state per execution path",
                "Semantic IR enables risk detection, ambiguity detection, clarity evolution, multi-model arbitration, and deterministic replay",
                "Semantic IR is the semantic ABI for lowering into CCNF ExecutionRequest"
            ],
            "code_snippets": [],
            "open_questions": [
                "Need to define formal Semantic IR Schema, SemanticProjection Schema, Graph Mutation Vocabulary, and WorkflowIntent ABI",
                "Should the conceptual structure be exactly: concepts + resolve_edges + trajectories + provenance + optional mutations?"
            ]
        }
    ]
}

# CONTENT B: Cognitive OS architecture & risk governance (chunk 6)
CONTENT_B_EXTRACTION = {
    "agenda_items": [
        {
            "title": "Formalize LOSM as a Dual-Mode Cognitive Operating System",
            "status": "Agreed",
            "intent_description": "Recognize that LOSM has evolved from an agentic pipeline into a cognitive operating system with two execution modes: Conduit (governed, temporal-backed, multi-role kernel-mode cognition) and harnessed NATS subscribers (ungoverned, opportunistic, distributed user-mode cognition). The system now consists of Conduit (WorkRequest Processing Unit), Absorb (ingest parser/semantic membrane), Nebula (intent marketplace queue), Vector (state snapshot system/temporal substrate), and the Knowledge Graph (semantic nervous system).",
            "requirements": [
                "WorkRequests must flow through roles, each embodied by models with their own context slices",
                "WorkRequests can contain DAGs of WorkRequests",
                "Strategies, tactics, introspection, reflection, and plans must be first-class citizens",
                "Absorb must convert HTML→DocLing→structured semantic substrate→Vector snapshots",
                "Nebula must stage work items, requests, tasks, requirements, and analysis artifacts as an intent marketplace",
                "Vector must snapshot state, WorkRequests, plans, analysis, and knowledge graph state",
                "Knowledge Graph must represent Roles, Plans, Strategies, Tactics, Requirements, WorkRequests, DAGs, Snapshots, State, Code, Intent, Interpretations, and Topologies as nodes with typed edges and lifecycle semantics"
            ],
            "implementation_notes": [
                "This is kernel-mode (Conduit) vs user-mode (NATS subscribers) cognition",
                "Conduit is the governed execution substrate, not 'the pipeline'",
                "The system is a distributed cognitive parliament, not an agent pipeline",
                "Components: kernel (Conduit), shell (Nebula + Absorb), filesystem (Vector), scheduler (WorkRequest DAGs), type system (knowledge graph), runtime (multi-role models), distributed execution layer (NATS subscribers)",
                "Multi-role architecture includes: Architect, Topologist, Analyst, Reviewer roles, Worker roles, external harnessed models"
            ],
            "code_snippets": [],
            "open_questions": [
                "Need to formalize: canonical ontology, type system for WorkRequests, lifecycle semantics for nodes, evaluation semantics for DAGs, role contracts, graph invariants, execution invariants, reflection/introspection protocols, governance rules for Conduit vs NATS workers",
                "Should we pick next: Define WorkRequest type system, specify WorkRequest lifecycle, define role contracts, formalize knowledge graph ontology, or define Conduit vs NATS execution semantics?"
            ]
        },
        {
            "title": "Implement Structural Risk Management as Governance Substrate",
            "status": "Agreed",
            "intent_description": "Build a complete end-to-end risk lifecycle (detection → classification → escalation → structured resolution → long-term learning) expressed as schemas, protocols, and graph-level reasoning. Risk is treated as structural pattern matching (compiler mindset) rather than event detection (compliance mindset). The system continuously senses, classifies, escalates, resolves, and learns from risk signals across the entire semantic filesystem.",
            "requirements": [
                "Risk Blocker Schema must be a typed artifact that routes itself through the governance graph",
                "Failure Pattern Matching Protocol must detect structural risk before execution, even when content appears benign",
                "Ambiguity Signature Model must detect underspecified, overdetermined, incoherent artifacts and model disagreement",
                "Ambiguity Score Function and Localization Algorithm must be defined",
                "Ambiguity Resolution Ledger and Clarity Evolution Model must track resolution state",
                "Escalation choreography must follow: Tester → Architect → Topologist → Inspector → Steward → Engineering → Human",
                "Risk must be represented as a filesystem tree: /Governance/Risk/{Blockers, OpenQuestions, Ambiguity, Resolutions}"
            ],
            "implementation_notes": [
                "Risk has a 'risk metabolism': detect → interpret → respond → adapt cycle",
                "This mirrors immune systems, distributed sensor networks, self-healing OSs, and high-reliability organizations",
                "The 'orb' clarity visualization shows epistemic stability, not risk",
                "Every protocol produces a file, every file is executable by the scheduler, interpretable by every model, auditable by humans",
                "This gives determinism, reproducibility, cross-model consistency, long-term learning, governance as code",
                "The Report Schema is the next missing piece — the canonical cross-model, cross-tier representation of 'a unit of work'"
            ],
            "code_snippets": [],
            "open_questions": [
                "Should we define the Report Schema next, or go deeper into how the orb's clarity signal is computed from the ambiguity ledger and resolution history?",
                "What is the exact schema for the Report Schema that ties risk detection, ambiguity detection, escalation, resolution, and clarity evolution into a single execution loop?"
            ]
        }
    ]
}

# CONTENT C: Determinism discussion (chunk 20)
CONTENT_C_EXTRACTION = {
    "agenda_items": [
        {
            "title": "Define Three Layers of Determinism in LOSM",
            "status": "Proposed",
            "intent_description": "Establish three distinct layers of determinism that the LOSM system must maintain: importer determinism (HTML import produces identical chunking regardless of environment), replay determinism (kernel replay of same envelopes produces identical graph state across runs), and mutation determinism (graph mutation event hashes remain stable and reproducible).",
            "requirements": [
                "Importer determinism: same HTML input must produce identical markdown and chunking",
                "Replay determinism: same envelope sequence must produce identical replay graph state",
                "Mutation determinism: mutation event hashes must be deterministic and reproducible across runs",
                "All three determinism layers must be independently verifiable via tests"
            ],
            "implementation_notes": [
                "Non-determinism undermines the entire governance and auditability model",
                "Each layer should have its own test suite and invariants",
                "Mutation determinism is critical for provenance tracking and attribution"
            ],
            "code_snippets": [],
            "open_questions": [
                "What are the specific sources of non-determinism in each layer?",
                "Should there be a combined 'full pipeline determinism' test?"
            ]
        }
    ]
}

async def submit_extraction(session, job_id, chunk_index, agenda):
    """Submit an extraction for a chunk."""
    result = await session.call_tool("rover_submit_extraction", {
        "job_id": job_id,
        "chunk_index": chunk_index,
        "agenda_json": json.dumps(agenda),
    })
    return json.loads(result.content[0].text)

EMPTY = {"agenda_items": []}

# Map: chunk_index -> extraction
EXTRACTIONS = {
    # Distant content chunks (first occurrence of each distinct topic)
    1: CONTENT_A_EXTRACTION,   # SemanticProjection + Semantic IR
    6: CONTENT_B_EXTRACTION,   # Cognitive OS + Risk governance
    20: CONTENT_C_EXTRACTION,  # Determinism layers
}

async def main():
    async with sse_client(url=SERVER_URL) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()

            # Process all 20 remaining chunks in order
            for chunk_idx in range(1, 21):  # chunks 1-20 are pending
                # Get the chunk
                result = await session.call_tool("rover_get_pending_chunk", {"job_id": JOB_ID})
                data = json.loads(result.content[0].text)
                if data.get("done"):
                    print("Server says done early — unexpected.")
                    break
                idx = data["chunk_index"]
                remaining = data["pending_count"]

                # Submit the appropriate extraction
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

            # Verify
            result = await session.call_tool("rover_job_status", {"job_id": JOB_ID})
            print(f"\nFinal status: {result.content[0].text}")

asyncio.run(main())
