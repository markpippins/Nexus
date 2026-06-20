#!/usr/bin/env python3
"""
Batch-process 'NLP Output from Chat Transcripts' (Microsoft Copilot transcript).

Content map (determined from offline analysis of chunk previews):
  Chunk 0: sidebar/nav (Copilot interface) — NOISE
  Chunk 1: WorkRequest/Plan schema — CONTENT A (first occurrence)
  Chunk 2: duplicate of chunk 0 — NOISE
  Chunk 3: duplicate of chunk 1 — NOISE
  Chunk 4: sidebar nav duplicates — NOISE
  Chunk 5: Plan schema (decisions, commitments, ontology) — CONTENT B
  Chunk 6: "Define NLP Projection Schema" — CONTENT C (first occurrence)
  Chunk 7: duplicate of chunk 1 — NOISE
  Chunk 8: duplicate of chunk 6 — NOISE
  Chunk 9: duplicate of chunk 1 — NOISE
  Chunk 10: Define NLP Projection Schema duplicate — NOISE
  Chunk 11: duplicate of chunk 1 — NOISE
  Chunk 12: "Define NLP Projection Schema" — CONTENT C (different view)
  Chunk 13: duplicate — NOISE
  Chunk 14: duplicate of 12 — NOISE
  Chunk 15: duplicate — NOISE
  Chunk 16: NLP Projection Schema full — CONTENT C (full copy)
  Chunk 17: Eval segmentation rules — CONTENT D
  Chunk 18: Eval Inference Rulebook — CONTENT E
  Chunk 19: Eval rules continued — CONTENT E (continuation)
  Chunk 20: Agenda schema — CONTENT F
  Chunk 21: Plurality Deliberation Rules — CONTENT G
  Chunk 22: duplicate — NOISE
  Chunk 23: Risk Blocker requirements — CONTENT H
  Chunk 24: Implementation discussion — CONTENT I
  Chunk 25: Implementation Plan JSON (structural risk) — CONTENT J
  Chunk 26: "Agenda items are work" — CONTENT K
  Chunk 27: Implementation plan continuation — CONTENT J (continuation)
"""
import asyncio
import json
from mcp import ClientSession
from mcp.client.sse import sse_client

JOB_ID = "150a1fd0"
SERVER_URL = "http://localhost:3102/sse"

# CONTENT A: WorkRequest / Plan formal schema with work_items, dependencies, constraints
CONTENT_A = {
    "agenda_items": [
        {
            "title": "Define Formal WorkRequest and WorkItem Schemas",
            "status": "Agreed",
            "intent_description": "Formal schema definitions for WorkRequest and WorkItem types that define the structure of all work flowing through the pipeline. WorkRequest contains title, summary, work_items, dependencies, constraints, and acceptance_criteria. WorkItem captures individual units of work within a request.",
            "requirements": [
                "WorkRequest must have: title, summary, work_items[], dependencies[], constraints[], acceptance_criteria[]",
                "WorkItem must define individual units of work with clear scope and completion criteria",
                "Dependencies must be modeled as typed edges between work items",
                "Constraints must capture implementation constraints on work items"
            ],
            "implementation_notes": [
                "This is the formal type system for all work flowing through the pipeline",
                "DependencyEdge and ImplConstraint are companion types referenced by WorkRequest"
            ],
            "code_snippets": [],
            "open_questions": [
                "How do work_items relate to the existing WorkRequest type in conduit-mcp?",
                "Should WorkRequest accept a DAG of work_items or a flat list?"
            ]
        }
    ]
}

# CONTENT B: Plan schema with decisions, commitments, ontology
CONTENT_B = {
    "agenda_items": [
        {
            "title": "Define Formal Plan Schema with Decisions, Commitments, and Ontology",
            "status": "Agreed",
            "intent_description": "A formal Plan schema that captures not just work items but the decisions made, commitments entered, constraints applied, and ontology references. This elevates a plan from a task list to a complete decision record.",
            "requirements": [
                "Plan must include: title, summary, decisions[], commitments[], constraints[], ontology reference",
                "Decisions must record what was decided and by which reasoning path",
                "Commitments must capture what the system commits to doing",
                "PlanConstraint must capture scope, resource, and temporal bounds",
                "PlanOntology must reference the ontology nodes this plan operates within"
            ],
            "implementation_notes": [
                "This goes beyond a simple task list to capture the full decision context",
                "Aligns with the governance-as-structure philosophy"
            ],
            "code_snippets": [],
            "open_questions": [
                "How does Plan relate to the conduit-mcp plan model?",
                "Should Plan be implemented as an extension of conduit-mcp's plan or a separate type?"
            ]
        }
    ]
}

# CONTENT C: NLP Projection Schema — the formal contract for NLP output
CONTENT_C = {
    "agenda_items": [
        {
            "title": "Define NLP Projection Schema as Formal Eval Input Contract",
            "status": "Agreed",
            "intent_description": "The NLP Projection Schema is the formal contract describing what NLP/LLM must emit for Eval to consume. It is the compiler-front-end output that defines the structure of transcript-extracted data before Eval processes it into segments, trajectories, and candidate objects. This directly answers open questions about artifact formats in the pipeline.",
            "requirements": [
                "NLP Projection Schema must define the formal output structure of transcript processing",
                "Eval must consume NLP Projections as its input — this is the contract boundary",
                "The schema must support all transcript types (ChatGPT, Copilot, others) uniformly",
                "Schema must include provenance tracking from source transcript segments"
            ],
            "implementation_notes": [
                "This is the compiler front-end output — NLP/LLM produces projections, Eval processes them",
                "Formalizes the contract between transcript ingestion and semantic evaluation",
                "Directly addresses open questions about how pipeline stages communicate"
            ],
            "code_snippets": [],
            "open_questions": [
                "Does NLP Projection Schema subsume or complement the existing rover extraction schemas?",
                "How does the projection schema handle multi-model outputs (different LLMs producing different projections)?"
            ]
        }
    ]
}

# CONTENT D+E: Eval Inference Rulebook
CONTENT_DE = {
    "agenda_items": [
        {
            "title": "Define Eval Inference Rulebook for NLP Projection Processing",
            "status": "Proposed",
            "intent_description": "The Eval Inference Rulebook defines how Eval transforms NLP projections over DocLang into segments, trajectories, and candidate objects. Key rules include: split segments when meaning diverges, discard segments that are noise, promote segments that carry structural or semantic weight, and segment boundaries are final only after Eval processes them (Eval must treat topics as segmentation hints, not final boundaries).",
            "requirements": [
                "Eval must treat topics as segmentation hints — not finalize segment boundaries",
                "Eval must split segments when meaning diverges between adjacent content",
                "Eval must discard segments that are noise",
                "Eval must promote segments that carry structural or semantic weight",
                "Segment boundaries are tentative until Eval finalizes them"
            ],
            "implementation_notes": [
                "Eval is the inference engine that sits between NLP Projection and the formal pipeline",
                "DocLang spans are the unit of content that Eval operates on",
                "Trajectories are derived from segment sequences with coherent meaning arcs"
            ],
            "code_snippets": [],
            "open_questions": [
                "How does Eval differ from the existing span segmenter?",
                "Should Eval replace or augment the current cascade span classifier?"
            ]
        }
    ]
}

# CONTENT F: Agenda schema
CONTENT_F = {
    "agenda_items": [
        {
            "title": "Define Formal Agenda Schema with Conceptual Maps",
            "status": "Proposed",
            "intent_description": "An Agenda schema that captures not just items but the conceptual map connecting them, unresolved intent, ontology issues, and constraint issues. The Agenda is the intermediate structure between raw transcript content and formal plans — it's what Plurality deliberates on.",
            "requirements": [
                "Agenda must include: items (AgendaItem[]), conceptual_map, unresolved_intent[], unresolved_ontology[], unresolved_constraints[]",
                "ConceptualMap must capture relationships between agenda items and their ontology grounding",
                "Unresolved intent, ontology, and constraint issues must be tracked as open items on the agenda"
            ],
            "implementation_notes": [
                "Agenda is the 'working memory' between raw extraction and formal planning",
                "Conceptual maps bridge the gap between what was said and what it means structurally"
            ],
            "code_snippets": [],
            "open_questions": [
                "Does Agenda exist as a persistent artifact or a transient processing stage?",
                "How does Agenda relate to the existing SpecificationAgenda schema in rover?"
            ]
        }
    ]
}

# CONTENT G: Plurality Deliberation Rules
CONTENT_G = {
    "agenda_items": [
        {
            "title": "Define Plurality Deliberation Rules for Agenda-to-Plan Resolution",
            "status": "Proposed",
            "intent_description": "Plurality is the parliament of meaning where the Agenda gets argued into a Plan. Deliberation rules define how multiple interpretations, objections, and candidate plans are resolved into a single coherent plan. This is the governance layer that makes the system more than a single-pass extraction pipeline.",
            "requirements": [
                "Plurality must resolve Agenda items into Plans through structured deliberation",
                "Deliberation must support multiple competing interpretations of the same transcript content",
                "Objections must be first-class citizens with structured rationale",
                "Resolution must produce a single coherent plan from multiple candidate interpretations"
            ],
            "implementation_notes": [
                "This is the 'parliament for meaning' — where ambiguity gets resolved structurally",
                "Multiple eval models can produce different projections from the same transcript",
                "Plurality is what reconciles these into a single actionable plan"
            ],
            "code_snippets": [],
            "open_questions": [
                "How does Plurality relate to the existing duality/plurality session concepts?",
                "Should Plurality produce a single 'winning' plan or maintain multiple competing plans?"
            ]
        }
    ]
}

# CONTENT H+I+J: Implementation plans referencing structural risk governance
CONTENT_HIJ = {
    "agenda_items": [
        {
            "title": "Generate Implementation Plan for Structural Risk Governance (Plan #003)",
            "status": "Proposed",
            "intent_description": "A concrete implementation plan JSON for structural risk governance, directly implementing Plan #003 (Structural Risk Management as Governance Substrate). Includes impl_plan_id, created_at, author_model_id, plan_id references, requirements, and files affected. Shows the system beginning to self-generate implementation plans from its own architecture.",
            "requirements": [
                "Implementation plan must reference its parent architecture plan (plan-structural-risk-governance)",
                "Must include explicit file paths affected",
                "Must include concrete requirements traceable to the architecture plan",
                "Risk Blocker Schema must be a typed artifact that routes itself through the governance graph"
            ],
            "implementation_notes": [
                "The system is now generating its own implementation plans — meta-execution loop is closing",
                "References span: Eval, NLP Projection, Plurality, and the existing risk governance ontology",
                "This is evidence of the system building itself"
            ],
            "code_snippets": [],
            "open_questions": [
                "Should self-generated implementation plans be stored alongside human-authored ones?",
                "What is the review process for self-generated plans?"
            ]
        }
    ]
}

# CONTENT K: System producing work from agenda
CONTENT_K = {
    "agenda_items": [
        {
            "title": "Recognize Agenda Items as First-Class Work Units",
            "status": "Agreed",
            "intent_description": "The system is already producing actionable structure from transcript processing — Agenda items are work, and the system is already producing a semantic backlog. This recognition elevates the extraction pipeline from 'analysis' to 'production' — the pipeline output IS the work queue.",
            "requirements": [
                "Agenda items must be actionable as work units",
                "The semantic backlog must be a first-class artifact that the pipeline produces",
                "Provenance must track which transcripts produced which agenda items"
            ],
            "implementation_notes": [
                "The system is already doing what we designed it to do — extracting work from transcripts",
                "This closes the loop between transcript processing and work production",
                "The SemanticBacklog schema formalizes this"
            ],
            "code_snippets": [],
            "open_questions": [
                "How does a SemanticBacklog integrate with Nebula (the intent marketplace)?",
                "Should the backlog feed directly into conduit-mcp as work requests?"
            ]
        }
    ]
}

EMPTY = {"agenda_items": []}

EXTRACTIONS = {
    # Content chunks (first occurrence of each distinct topic)
    1: CONTENT_A,      # WorkRequest/Plan schema
    5: CONTENT_B,      # Plan schema with decisions/commitments
    6: CONTENT_C,      # NLP Projection Schema (first occurrence)
    12: CONTENT_C,     # NLP Projection Schema (different view)
    16: CONTENT_C,     # NLP Projection Schema (full copy)
    17: CONTENT_DE,    # Eval segmentation rules
    18: CONTENT_DE,    # Eval Inference Rulebook
    19: CONTENT_DE,    # Eval rules continued
    20: CONTENT_F,     # Agenda schema
    21: CONTENT_G,     # Plurality Deliberation Rules
    23: CONTENT_HIJ,   # Risk Blocker requirements
    24: CONTENT_HIJ,   # Implementation discussion
    25: CONTENT_HIJ,   # Implementation Plan JSON
    26: CONTENT_K,     # Agenda items are work
    27: CONTENT_HIJ,   # Implementation plan continuation
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

            for chunk_idx in range(28):
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
