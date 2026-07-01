#!/usr/bin/env python3
"""
Manual inference filing — Buffy's own analysis mapped to Nebula hierarchy.
Creates candidates for the remaining 11 unfiled harvests.
"""

import json, logging, sys, subprocess
import urllib.request, urllib.error

log = logging.getLogger("manual_file")

NEBULA_API = "http://localhost:3101/api"
DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", stream=sys.stderr)

def psql(sql, timeout=30):
    r = subprocess.run(DOCKER_PSQL + ["-t", "-A"], input=sql, capture_output=True, text=True, timeout=timeout)
    return r.returncode, r.stdout.strip()

def nebula_post(path, body):
    url = f"{NEBULA_API}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode() if e.fp else "(no body)"
        log.error("  API error %s: %s", e.code, body_text[:300])
        return {"error": True, "status": e.code}

def nebula_get(path):
    url = f"{NEBULA_API}{path}"
    with urllib.request.urlopen(url, timeout=15) as r:
        return json.loads(r.read().decode())

# Get the hierarchy for ID resolution
log.info("Fetching hierarchy...")
systems = nebula_get("/systems")
log.info("Got %d systems", len(systems))

# Build lookup maps
sys_by_name = {}
sub_by_qname = {}  # "systemname::subsystemname"
feat_by_qname = {}

for s in systems:
    sname_lower = s["name"].lower()
    sys_by_name[sname_lower] = s["id"]
    for sub in s.get("subsystems", []):
        subname_lower = sub["name"].lower()
        sub_by_qname[f"{sname_lower}::{subname_lower}"] = sub["id"]
        sub_by_qname[subname_lower] = sub["id"]  # fallback
        for f in sub.get("features", []):
            fname_lower = f["name"].lower()
            feat_by_qname[f"{subname_lower}::{fname_lower}"] = f["id"]
            feat_by_qname[f"{sname_lower}::{subname_lower}::{fname_lower}"] = f["id"]

def resolve_id(system_name, subsystem_name=None, feature_name=None):
    """Resolve hierarchy names to UUIDs."""
    sid = None
    subid = None
    fid = None
    if system_name:
        sid = sys_by_name.get(system_name.lower())
    if subsystem_name:
        key = f"{system_name.lower()}::{subsystem_name.lower()}" if system_name else subsystem_name.lower()
        subid = sub_by_qname.get(key) or sub_by_qname.get(subsystem_name.lower())
    if feature_name and subid:
        fid = feat_by_qname.get(f"{subsystem_name.lower()}::{feature_name.lower()}") if subsystem_name else None
    return sid, subid, fid

# ============================================================
# MANUAL INFERENCE — Buffy's analysis
# ============================================================

candidates_to_create = [
    # 1. Branch · Buzzwords by Layer.html
    {
        "harvest_id": "f15e5605-ecec-434c-b164-1ef30f7f9129",
        "title": "Three-Domain State Architecture: Nebula → Conduit → Production",
        "intentDescription": "Define the three independent state domains that govern how intent becomes executable work, how work executes, and how outputs are promoted into retained and/or deployable reality. Nebula holds 'what we want to be true' (plans, requirements, intent), Conduit handles 'how we attempt to make it true' (execution, validation gates), and Production retains 'what has been made true enough to keep' (artifacts, receipts, promoted results).",
        "systemMatch": "Agentic Pipeline Overview",
        "tags": ["harvest-candidate", "dockling", "state-domains", "promotion-pipeline"]
    },
    {
        "harvest_id": "f15e5605-ecec-434c-b164-1ef30f7f9129",
        "title": "Git as State Transition Substrate for Governance",
        "intentDescription": "Treat Git not as a version control system but as a state transition substrate for governance decisions. Git-visible deltas correspond to autonomous system states, and transitions between them are governed by explicit invariants. Nebula becomes 'git for decisions', tracking which version of truth the system can share or reproduce, separate from filesystem reality.",
        "systemMatch": "Governance, Policy & Constitution",
        "tags": ["harvest-candidate", "dockling", "git-substrate", "state-transitions"]
    },
    
    # 2. Nexus - Neo4j vs OrientDB.html
    {
        "harvest_id": "94016b0e-ac3c-4ebc-b787-c19a031a36f3",
        "title": "Identity-Driven Artifact Model: Magnets + UUIDs for Filesystem Objects",
        "intentDescription": "Decouple filesystem identity from path by assigning UUID-tagged 'magnet' folders. The filesystem-server provides primitive operations (hasFolder, hasFile), while higher tiers (Java services, UI) orchestrate identity, TypeSpec models, and metadata. Artifact recognition (isGitRepo, isMavenProject) seeds identity on first encounter, then identity-first reasoning takes over with drift detection for resilience.",
        "systemMatch": "Knowledge Infrastructure & Ontology",
        "subsystemMatch": "File System Server",
        "tags": ["harvest-candidate", "dockling", "identity-model", "magnets", "filesystem"]
    },
    {
        "harvest_id": "94016b0e-ac3c-4ebc-b787-c19a031a36f3",
        "title": "Self-Composing Screens from TypeSpec Data Models",
        "intentDescription": "Generate UI screens directly from TypeSpec data models, reviving the 4GL paradigm (PowerBuilder, Delphi) that was lost when web frameworks separated everything. TypeSpec acts as a substrate — screens are projections of typed models, with operations menu populated from model capabilities rather than hardcoded app menus.",
        "systemMatch": "TypeSpec, Contracts & Code Generation",
        "tags": ["harvest-candidate", "dockling", "self-composing-ui", "typespec", "4gl"]
    },
    
    # 3. Strontium as cognition node.html
    {
        "harvest_id": "74b5b872-d5f5-42fe-9860-50a5221e2721",
        "title": "Voyager Query Language (VQL) — Constrained Graph Traversal over Nebula",
        "intentDescription": "A declarative + procedural hybrid DSL for hypothesis testing over the Nebula knowledge graph without risk of corruption. Voyager operates only on graph state and traversal results — it does not modify the graph, execute plans, or issue work requests. It generates, tests, and refines hypotheses through constrained traversal.",
        "systemMatch": "Knowledge Infrastructure & Ontology",
        "tags": ["harvest-candidate", "dockling", "vql", "graph-traversal", "hypothesis-testing"]
    },
    {
        "harvest_id": "74b5b872-d5f5-42fe-9860-50a5221e2721",
        "title": "Memory Consolidator — Raw Graph Growth to Stable Concepts",
        "intentDescription": "A Nebula subsystem that prevents knowledge graph rot by consolidating raw graph growth into stable, durable concepts. Without consolidation, Nebula becomes a junk drawer. The Memory Consolidator identifies clusters, resolves duplicates, and promotes emergent patterns into first-class knowledge entities, maintaining graph quality over time.",
        "systemMatch": "Knowledge Infrastructure & Ontology",
        "tags": ["harvest-candidate", "dockling", "memory-consolidation", "graph-quality"]
    },
    
    # 4. System Evolution and Naming.html
    {
        "harvest_id": "5a6af727-cb09-43cd-ad2d-60e5cc75bc05",
        "title": "SemanticProjection as Canonical State Replacement",
        "intentDescription": "Replace MaterializedReplayView with SemanticProjection and SemanticProjectionBuilder as the unified meta-model for state projection. This is a meta-model unification move — SemanticProjection becomes the canonical representation for projecting system state, with SemanticProjectionBuilder handling construction and validation.",
        "systemMatch": "Knowledge Infrastructure & Ontology",
        "subsystemMatch": "Semantic IR",
        "tags": ["harvest-candidate", "dockling", "semantic-projection", "meta-model"]
    },
    {
        "harvest_id": "5a6af727-cb09-43cd-ad2d-60e5cc75bc05",
        "title": "Specification Compilation Pipeline: HTML → DocLang → Executable Spec",
        "intentDescription": "Formalize the transformation boundary from harvested HTML discourse through DocLang intermediate representation to compile-ready executable specifications. The pipeline must ensure all ambiguity is either structurally resolved or explicitly preserved as constraints, never left implicit, enforcing the invariant that no semantic content is silently dropped.",
        "systemMatch": "Agentic Pipeline Overview",
        "tags": ["harvest-candidate", "dockling", "compilation-pipeline", "doclang", "spec-generation"]
    },
    
    # 5. WRP DAG Planning Guidance.html
    {
        "harvest_id": "e12a3940-3790-4d3e-a2a6-05f71997a89f",
        "title": "WRP DAG IR v1.1 — Tenancy and Probabilistic Execution Hints",
        "intentDescription": "Extend the WorkRequest IR with mandatory tenant_id on EventEnvelope, DAG topology for work request dependency graphs, and probabilistic execution hints. This is a non-breaking extension — v1.0 execution semantics are preserved while adding multi-tenant isolation and structural DAG representation.",
        "systemMatch": "Event-Driven Architecture",
        "tags": ["harvest-candidate", "dockling", "wrp", "dag", "tenancy"]
    },
    {
        "harvest_id": "e12a3940-3790-4d3e-a2a6-05f71997a89f",
        "title": "WRP Traversal Engine v1.2 — DAG as Execution Substrate",
        "intentDescription": "A runtime engine that walks the WRP DAG as a first-class behavior system with state-preserving traversal semantics. The DAG is no longer just a representation — it becomes an execution substrate. The traversal engine handles node visitation order, state propagation, and rollback boundaries while preserving v1.0 kernel correctness.",
        "systemMatch": "Event-Driven Architecture",
        "tags": ["harvest-candidate", "dockling", "wrp", "traversal-engine", "dag-execution"]
    },
    
    # 6. Distributed Cognition Design.html
    {
        "harvest_id": "42c58049-8e3c-4ed3-8baf-9b4fa91af83e",
        "title": "OLAP Projection Backend for Nexus Semantic Substrate",
        "intentDescription": "Integrate an external OLAP engine as a query and projection backend over Nexus events and fact data. The OLAP database collects data through listeners and transformers, providing time-series and dimensional query capabilities. It serves as an external projection engine — not part of the core model — enabling RAG-style lookups and analytics without polluting the semantic substrate.",
        "systemMatch": "Knowledge Infrastructure & Ontology",
        "tags": ["harvest-candidate", "dockling", "olap", "analytics", "projection"]
    },
    {
        "harvest_id": "42c58049-8e3c-4ed3-8baf-9b4fa91af83e",
        "title": "Three-Role Data Architecture: Events / Facts / Derived Intelligence",
        "intentDescription": "Establish three clean data roles: (1) Nexus events — the semantic substrate's native event stream, (2) Fact DB — external structured data ingested and normalized, (3) Derived intelligence — OLAP cubes and queryable surfaces built from the first two. A Searcher agent populates the Fact DB from external sources like Datarade datasets.",
        "systemMatch": "Knowledge Infrastructure & Ontology",
        "tags": ["harvest-candidate", "dockling", "data-architecture", "events", "facts"]
    },
    
    # 7. Nebula Harvest Triage.html
    {
        "harvest_id": "e940787e-ff60-47dc-803d-f322530c8bb9",
        "title": "Three-Mode Intelligence Architecture: Graph → Batch → Extraction",
        "intentDescription": "Separate the intelligence pipeline into three distinct modes: (1) Discourse Truth Graph — constructing graph representations from conversation transcripts, (2) Batch Inference Filing — using LLM inference to classify and file harvested content into the Nebula hierarchy, (3) Rover Extraction — extracting specifications and candidates from processed harvests. Each mode has distinct quality guarantees and failure modes.",
        "systemMatch": "Agentic Pipeline Overview",
        "tags": ["harvest-candidate", "dockling", "intelligence-modes", "pipeline"]
    },
    {
        "harvest_id": "e940787e-ff60-47dc-803d-f322530c8bb9",
        "title": "DocLang → DAL Pipeline: Discourse to Structured Knowledge",
        "intentDescription": "The transformation chain from raw HTML chat transcripts through DocLang (discourse-aware intermediate representation) to DAL (knowledge graph entries). This pipeline enables batch processing of conversations into the Nebula knowledge graph via structured inference, turning Nebula from an accumulation surface into an intelligence surface.",
        "systemMatch": "Knowledge Infrastructure & Ontology",
        "tags": ["harvest-candidate", "dockling", "doclang", "dal", "knowledge-pipeline"]
    },
    
    # 8. Nexus - Reviewing Qwen's Output.html
    {
        "harvest_id": "b7848588-a6a7-465e-a4a7-48dfbb5061a8",
        "title": "Multi-Layer TypeSpec Architecture: Core + Platform-Specific Contracts",
        "intentDescription": "Establish a two-layer TypeSpec contract architecture: a generic core layer with platform-neutral API contracts, and platform-specific layers (Spring, Quarkus) that extend the core with implementation-specific details. The IBroker interface serves as a cross-implementation contract — useful for normalization but not a TypeSpec requirement. Platform layers can diverge while sharing the core model.",
        "systemMatch": "TypeSpec, Contracts & Code Generation",
        "tags": ["harvest-candidate", "dockling", "typespec", "multi-platform", "contract-layer"]
    },
    {
        "harvest_id": "b7848588-a6a7-465e-a4a7-48dfbb5061a8",
        "title": "Service Broker Test Harness from TypeSpec Contracts",
        "intentDescription": "Generate a test harness from the TypeSpec broker contract to validate services (starting with FileService) via the V1 API while preserving V0 as a frozen reference implementation. The harness uses the TypeSpec-generated client to talk to real services, with Node adapter hooks for gradual replacement of stubs with real implementations.",
        "systemMatch": "JVM Services",
        "subsystemMatch": "Spring Boot",
        "tags": ["harvest-candidate", "dockling", "test-harness", "typespec", "broker"]
    },
    
    # 9. Operational Intelligence Loop.html
    {
        "harvest_id": "ca804c71-a471-46ec-b985-4c4105d553fa",
        "title": "Redis as Cognitive Working Memory / Attention Horizon",
        "intentDescription": "Redis serves as the cognitive runtime's working memory — not a database or cache, but a selection surface representing the agent's current attention horizon. It holds what the system is actively tuned into (current tasks, active harvest results, in-flight work). Like a stock ticker passing through but not being stored, Redis filters relevance without accumulating everything.",
        "systemMatch": "Agent Architecture & Leases",
        "subsystemMatch": "Cognitive Runtime",
        "tags": ["harvest-candidate", "dockling", "redis", "working-memory", "attention"]
    },
    {
        "harvest_id": "ca804c71-a471-46ec-b985-4c4105d553fa",
        "title": "Interest-Driven Perception Model — Tuning via Redis Overlap",
        "intentDescription": "Redefine agent perception not as raw input processing but as alignment between the agent's current internal model and incoming signals. When harvest results overlap with what's already in Redis (the agent's active working set), the system shows interest — creating a mechanistic tuning loop where attention is driven by semantic overlap, not polling or subscriptions.",
        "systemMatch": "Agent Architecture & Leases",
        "subsystemMatch": "Cognitive Runtime",
        "tags": ["harvest-candidate", "dockling", "perception", "interest-model", "tuning"]
    },
    
    # 10. Report Schema Analysis.html
    {
        "harvest_id": "ae147f3c-a3e0-4f6a-95b1-5d08feb2a064",
        "title": "Roundtable Arbitration Model — Role Leases with Semantic Policies",
        "intentDescription": "Governance model where role leases partition the knowledge graph by authority + posture, enabling multiple simultaneous interpretations of the same artifact. When no roundtable member objects, an artifact is accepted. When there are objections, the system arbitrates via a projection that accounts for risk. This transforms interpretation from a parsing problem into a governance arbitration problem.",
        "systemMatch": "Governance, Policy & Constitution",
        "tags": ["harvest-candidate", "dockling", "roundtable", "arbitration", "role-leases"]
    },
    {
        "harvest_id": "ae147f3c-a3e0-4f6a-95b1-5d08feb2a064",
        "title": "Domain-Slice Architecture for Multi-Agent Knowledge Access",
        "intentDescription": "Each roundtable member receives a domain slice — a partition of the knowledge graph with explicit authority (Read/Write/Validate/Execute) and posture (Strict/Balanced/Exploratory/Adversarial). The domain slice, authority, and posture tuple defines what each agent can see, how it can interpret it, and what weight its objection carries in arbitration.",
        "systemMatch": "Agent Architecture & Leases",
        "tags": ["harvest-candidate", "dockling", "domain-slice", "authority", "multi-agent"]
    },
    
    # 11. PEB Phase 1 Checkpoint.html
    {
        "harvest_id": "96d6cebf-f06f-4c37-ac5b-f086e3146b7a",
        "title": "PEB Architecture Checkpoint — 10-Module Governance Engine",
        "intentDescription": "PEB (Persistent Engineering Brain) Phase 1 checkpoint with 10 cleanly separated modules: peb-domain (6 JPA entities: PebState, PebTransaction, PebDecision, PebTrace, PebViolation, PebCapability), peb-hash (content-addressable hashing), peb-core (state machine engine), peb-store (persistence), peb-api (public contracts), peb-adapters (integration layer), peb-observability (metrics/tracing), peb-bootstrap (initialization), and peb-test (fixtures). Designed as governance infrastructure, not CRUD.",
        "systemMatch": "peb-kernel",
        "tags": ["harvest-candidate", "dockling", "peb", "governance", "module-architecture"]
    },
]

# ============================================================
# EXECUTION
# ============================================================

import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--dry-run", action="store_true")
args = parser.parse_args()

log.info("=" * 60)
log.info("Manual Inference Filing — Buffy's Analysis")
log.info("Harvests: %d | Candidates: %d", len(set(c["harvest_id"] for c in candidates_to_create)), len(candidates_to_create))

if args.dry_run:
    log.info("DRY RUN — no candidates will be created")
    for c in candidates_to_create:
        sid, subid, fid = resolve_id(c.get("systemMatch"), c.get("subsystemMatch"), c.get("featureMatch"))
        hid = c["harvest_id"][:12]
        print(f"  [{hid}] {c['title'][:70]}")
        print(f"    → system={sid[:12] if sid else 'NOT FOUND'} sub={subid[:12] if subid else '-'} feat={fid[:12] if fid else '-'}")
    sys.exit(0)

created = 0
failed = 0
for c in candidates_to_create:
    sid, subid, fid = resolve_id(c.get("systemMatch"), c.get("subsystemMatch"), c.get("featureMatch"))
    
    body = {
        "harvestId": c["harvest_id"],
        "title": c["title"],
        "intentDescription": c["intentDescription"],
        "systemId": sid,
        "subsystemId": subid,
        "featureId": fid,
        "status": "pending",
        "tags": c.get("tags", ["harvest-candidate", "dockling"]),
    }
    
    hid_short = c["harvest_id"][:12]
    result = nebula_post("/harvest-candidates", body)
    if isinstance(result, dict) and result.get("error"):
        log.error("  FAIL [%s] %s", hid_short, c["title"][:60])
        failed += 1
    else:
        log.info("  OK  [%s] %s", hid_short, c["title"][:60])
        created += 1

log.info("=" * 60)
log.info("Done: %d created, %d failed, %d total", created, failed, len(candidates_to_create))
