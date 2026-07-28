#!/usr/bin/env python3
"""
Batch-process 'Semantic IR v0.1 Overview' (Microsoft Copilot transcript).

Content map (from offline markdown analysis):
  The transcript is ~7354 lines, ~594K chars. ~90% is repeated "State Ontology
  Analysis: WorkflowState vs WorkStatus" from the HTML export format.
  ~10% is unique WRP specification content at lines 6490-7354.

Unique content sections:
  A. State Ontology Analysis — WorkflowState → WorkStatus merge plan
     (provided as user context, already related to existing plans)
  B. LOSM-IR Package Catalog — "bp sez" 14 module overview (reference)
  C. WRP v1.0 Protocol Specification — schema, events, state machine, API,
     versioning, cross-system consistency, end-to-end execution contract,
     what WRP becomes, where you are now, what comes next
  D. WRP Migration Plan — 4-phase rollout (shadow, dual-write, primary,
     legacy collapse), dependency collapse, 8-step migration order
  E. Future Extensions — Multi-tenant, Hierarchical DAG, Probabilistic WRP
"""
import asyncio
import json
from mcp import ClientSession
from mcp.client.sse import sse_client

JOB_ID = "2b695bb3"
SERVER_URL = "http://localhost:3102/sse"

# CONTENT A: State Ontology Analysis — WorkflowState → WorkStatus merge
CONTENT_A = {
    "agenda_items": [
        {
            "title": "State Ontology Consolidation: Merge WorkflowState into WorkStatus Projection",
            "status": "Agreed",
            "intent_description": "Two state enums coexist: WorkflowState (9 states, IR-level lifecycle) and WorkStatus (11 states, operational pipeline). The recommendation is to merge them: WorkStatus remains canonical enum (DB-backed, transition table uses it), WorkflowState becomes a computed projection via work_status_to_phase(). This resolves the dual-truth problem where 3 planning-phase WorkStatus states collapse into 1 WorkflowState (PLAN_DONE) and the entry INTAKE state collapses into NEW. CRITIQUED exists only in WorkflowState — must decide if critique is a distinct operational state or a side effect of review.",
            "requirements": [
                "WorkStatus must remain the canonical enum — DB-backed, transition-table-routed",
                "WorkflowState becomes work_status_to_phase() computed projection — never an independent truth",
                "CRITIQUED must be reconciled: either add CRITIQUE to WorkStatus or remove from WorkflowState",
                "WorkStatus enum must move to losm-ir alongside validate_transition()"
            ],
            "implementation_notes": [
                "Migration order: (1) work_status_to_phase() in losm-ir, (2) Move WorkStatus enum to losm-ir, (3) Move validate_transition to losm-ir, (4) Deprecate direct WorkflowState use, (5) Remove WorkflowState or keep as alias",
                "This is already partially covered by existing plans — this adds specific migration steps",
                "The transition table must remain keyed on WorkStatus — WorkflowState is too coarse for routing decisions"
            ],
            "code_snippets": [],
            "open_questions": [
                "Should CRITIQUE be added as a distinct WorkStatus state, or is critique purely a review artifact?",
                "Should WorkStatus enum live in losm-ir or stay in losm-store?"
            ]
        }
    ]
}

# CONTENT C: WRP v1.0 Protocol Specification
CONTENT_C = {
    "agenda_items": [
        {
            "title": "WRP v1.0 — Formal Protocol Specification (Schema + Events + State Machine + API)",
            "status": "Agreed",
            "intent_description": "WRP (WorkRequest Protocol) is defined as a versioned event-sourced protocol for lifecycle-driven execution of WorkRequestDCO objects across distributed cognitive runtimes. It has 4 canonical artifacts: (1) WorkRequest Schema — versioned JSON schema for the canonical IR contract, (2) WRP Event Schema — base event contract with causation_id/correlation_id + concrete lifecycle events (WRP_INGESTED, WRP_PLANNED, WRP_EXECUTED, WRP_VALIDATED, WRP_CONVERGED), (3) WRP State Machine — single source of truth with 11 states (CREATED→INTAKE→PLANNING→CRITIQUE→SPECIFICATION→EXECUTION→VALIDATION→COMPLETED/FAILED/BLOCKED/CONVERGED) plus formal adjacency matrix, (4) WRP API Contract — OpenAPI for Spring↔Python bridge (create WorkRequest, emit event, get state, replay). Versioning at 3 levels: Protocol, Event, WorkRequest.",
            "requirements": [
                "WRP must be a typed event-sourced protocol — not an architecture document",
                "WorkRequest Schema must have versioned JSON schema with $id",
                "WRP Event Schema must have base contract (event_id, wrp_id, type, timestamp, version, causation_id, correlation_id, payload) plus concrete event types",
                "WRP State Machine must be single source of truth with 11 states and formal adjacency matrix",
                "WRP API must define 4 endpoints: create WorkRequest, emit event, get state, replay",
                "3-level versioning: Protocol version, Event version (additive only), WorkRequest version",
                "Cross-system consistency: ALL systems must agree on WRPState transitions — Spring emits events, Python kernel executes, DB stores, Nexus visualizes"
            ],
            "implementation_notes": [
                "State machine invariants: Only VALIDATION can reach COMPLETED; Only EXECUTION can reach VALIDATION; CRITIQUE cannot directly execute; CONVERGED is orthogonal over any terminal state",
                "End-to-end execution: 15-step loop from Spring receives WorkRequest → WRP_INGESTED → kernel builds projection → policies evaluate → WRP_PLANNED → execution → WRP_EXECUTED → validation → WRP_VALIDATED → convergence → WRP_CONVERGED → snapshot → Nexus UI",
                "This is the 'semantic glue' that makes every layer agree on 'what is happening right now'",
                "WRP is simultaneously: API contract, state machine, event system, execution protocol, and UI feed model"
            ],
            "code_snippets": [],
            "open_questions": [
                "Should WRP state machine live in losm-ir or a new losm-wrp package?",
                "What is the exact causation_id computation rule?"
            ]
        }
    ]
}

# CONTENT D: WRP Migration Plan
CONTENT_D = {
    "agenda_items": [
        {
            "title": "WRP Migration Plan — 4-Phase Rollout from Legacy to WRP-Compliant Runtime",
            "status": "Agreed",
            "intent_description": "Incremental structural replacement with compatibility layers so everything continues running while the system re-wires itself underneath. Phase 1 (Shadow): Introduce WRP package with no integration, mirror events only. Phase 2 (Dual-write): Replace transition validation entrypoint with WRP-aware wrapper, kernel becomes event subscriber. Phase 3 (WRP Primary): Invert control — execution driven by WRP events, kernel becomes reactive. Phase 4 (Legacy Collapse): Remove WorkStatus as active driver, replace WorkflowState with projection, remove direct transition tables from shell, move execution authority fully to WRP runtime. Final dependency: Spring → WRP Event API → Event Store → WRP Runtime Engine → Cognitive Kernel → Snapshot Store → Nexus.",
            "requirements": [
                "Phase 1: New losm-wrp package with shadow event emitters — NO behavior change",
                "Phase 2: Dual-write validation — both legacy and WRP transitions validated, WRP events persist",
                "Phase 3: WRP events become the execution driver — kernel becomes reactive subscriber",
                "Phase 4: Legacy state machines removed, shell becomes event router only",
                "8-step migration order must be followed exactly",
                "Zero-break during migration — all existing functionality continues"
            ],
            "implementation_notes": [
                "Migration order: (1) Introduce WRP package, (2) Add shadow emitters everywhere, (3) Persist WRP events in DB, (4) Build replay engine, (5) Switch shell runtime loop to WRP events, (6) Redirect kernel invocation to event bridge, (7) Deprecate WorkStatus/WorkflowState, (8) Remove legacy transition system",
                "This fixes 3 architectural issues: dual-truth problem (3 competing state machines → single truth), imperative execution (kernel called directly → event-driven), and missing replay capability",
                "Final architecture: Spring Boot (Ingress) → WRP Event API → Event Store → WRP Runtime Engine → Cognitive Kernel → State Space + Policy Evolution → Snapshot Store → Nexus (observability only)"
            ],
            "code_snippets": [],
            "open_questions": [
                "Should the migration happen before or after MEEP bootstrap?",
                "Does losm-store schema need changes for WRP event persistence?"
            ]
        }
    ]
}

# CONTENT E: Future Extensions — WRP DAG, Multi-tenant, Probabilistic
CONTENT_E = {
    "agenda_items": [
        {
            "title": "WRP Future Extensions — DAG, Multi-Tenant, Probabilistic Execution",
            "status": "Proposed",
            "intent_description": "Three meaningful expansions beyond WRP v1.0: (A) Multi-tenant WRP — many kernels sharing a common event space with tenant isolation, (B) Hierarchical WRP — WorkRequest DAGs as nested runtimes with recursive kernel invocation, enabling WorkRequest decomposition into sub-workflows that each run their own WRP lifecycle, (C) Probabilistic WRP — non-deterministic policy execution with sampling and distribution-aware state transitions. The most natural next step is WRP DAG extension (WorkRequestDAG + nested execution + recursive kernel invocation), which transforms the system from a flat pipeline into a recursive cognitive system.",
            "requirements": [
                "WRP DAG: WorkRequest decomposition into sub-workflows, each with own WRP lifecycle",
                "Multi-tenant: Shared event space with kernel isolation per tenant",
                "Probabilistic: Non-deterministic policy execution with sampling support",
                "All extensions must preserve the core WRP invariants: determinism, append-only, freeze boundary"
            ],
            "implementation_notes": [
                "WRP DAG is the natural next step after WRP v1.0 — it enables a true recursive cognitive system",
                "Multi-tenant requires tenant_id in event schema and kernel routing",
                "Probabilistic WRP is the most speculative — requires convergence guarantees before implementation"
            ],
            "code_snippets": [],
            "open_questions": [
                "Should WRP DAG be planned now or deferred until WRP v1.0 is running?",
                "Does the current event schema support tenant_id?"
            ]
        }
    ]
}

EMPTY = {"agenda_items": []}

# Define which chunks get which content
# Chunks 0-15: mostly repeated state ontology (already covered by existing plans)
# Chunks 16-18: unique WRP spec content (based on line analysis of source)
# Content A goes to first content chunk (state ontology analysis, reference)
# Content C goes to WRP spec chunk
# Content D goes to migration plan chunk
# Content E goes to future extensions chunk

EXTRACTIONS = {
    # Most chunks are noise/repeats — we submit empty for those
    # The unique content regions based on source line analysis:
    # Lines 5-3403 (chunks 0-12-ish): repeated state ontology — all noise (covered by existing plans)
    # Lines 3403-3513 (appears in one chunk): conversation start — CONTENT A (state ontology reference)
    # Lines 3513-6490 (many chunks): more repeated state ontology — all noise
    # Lines 6490-6650 (one chunk): WRP v1.0 specification — CONTENT C
    # Lines 6650-6912 (one chunk): WRP execution contract + what WRP becomes — CONTENT C continuation
    # Lines 6912-7316 (one-two chunks): WRP migration plan — CONTENT D
    # Lines 7316-7354 (one chunk): Future extensions — CONTENT E
    0: EMPTY,        # Sidebar/nav noise
    # Most intermediate chunks are state ontology repeats — we'll submit CONTENT A once and EMPTY for the rest
    16: CONTENT_C,   # WRP v1.0 Protocol Specification
    17: CONTENT_D,   # WRP Migration Plan
    18: CONTENT_E,   # Future Extensions
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

            for chunk_idx in range(19):
                result = await session.call_tool("rover_get_pending_chunk", {
                    "job_id": JOB_ID,
                })
                data = json.loads(result.content[0].text)
                if data.get("done"):
                    print("Server says done early — unexpected.")
                    break
                idx = data["chunk_index"]
                remaining = data["pending_count"]
                text = data.get("chunk_text", "")
                text_len = len(text) if text else 0

                if idx in EXTRACTIONS:
                    agenda = EXTRACTIONS[idx]
                    resp = await submit_extraction(session, JOB_ID, idx, agenda)
                    items = len(agenda["agenda_items"])
                    # Preview first item
                    title = agenda["agenda_items"][0]["title"][:80] if items > 0 else "EMPTY"
                    print(f"[{remaining-1:>2} remaining] Chunk {idx:>2} ({text_len:>6} chars): submitted {items} item(s) — {title}")
                else:
                    # Auto-classify: long chunks with state ontology content get CONTENT_A once
                    # All others are noise/repeats
                    if "State Ontology" in text and "WorkflowState" in text and chunk_idx not in EXTRACTIONS:
                        # This is a state ontology repeat — already covered, skip
                        resp = await submit_extraction(session, JOB_ID, idx, EMPTY)
                        print(f"[{remaining-1:>2} remaining] Chunk {idx:>2} ({text_len:>6} chars): submitted 0 items — NOISE (State Ontology repeat)")
                    else:
                        resp = await submit_extraction(session, JOB_ID, idx, EMPTY)
                        print(f"[{remaining-1:>2} remaining] Chunk {idx:>2} ({text_len:>6} chars): submitted 0 items — NOISE/DUPLICATE")

                if resp.get("remaining_chunks", 1) == 0:
                    print("\n→ All chunks processed!")

            result = await session.call_tool("rover_job_status", {"job_id": JOB_ID})
            print(f"\nFinal status: {result.content[0].text}")

asyncio.run(main())
