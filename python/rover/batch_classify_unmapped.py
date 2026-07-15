#!/usr/bin/env python3
"""Classify all unmapped pending candidates into the Nebula hierarchy."""

import json, logging, sys, subprocess, time
import urllib.request, urllib.error

from event_emitter import emit_candidate_classified

log = logging.getLogger("classify")
DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]
NEBULA_API = "http://localhost:3101/api"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", stream=sys.stderr)

def psql(sql, timeout=30):
    r = subprocess.run(DOCKER_PSQL + ["-t", "-A"], input=sql, capture_output=True, text=True, timeout=timeout)
    return r.returncode, r.stdout.strip()

def nebula_get(path):
    url = f"{NEBULA_API}{path}"
    with urllib.request.urlopen(url, timeout=15) as r:
        return json.loads(r.read().decode())

def nebula_post(path, body):
    url = f"{NEBULA_API}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": True, "status": e.code}

# Fetch hierarchy
log.info("Fetching hierarchy...")
systems = nebula_get("/systems")

sys_by_name = {}
sub_by_qname = {}

for s in systems:
    sname = s["name"].lower()
    sys_by_name[sname] = s["id"]
    for sub in s.get("subsystems", []):
        subname = sub["name"].lower()
        sub_by_qname[f"{sname}::{subname}"] = sub["id"]
        sub_by_qname[subname] = sub["id"]

log.info("Got %d systems, %d subsystem keys", len(systems), len(sub_by_qname))

def resolve(system_name, subsystem_name=None):
    sid = sys_by_name.get(system_name.lower()) if system_name else None
    subid = None
    if subsystem_name and system_name:
        subid = sub_by_qname.get(f"{system_name.lower()}::{subsystem_name.lower()}")
    elif subsystem_name:
        subid = sub_by_qname.get(subsystem_name.lower())
    return sid, subid

# ============================================================
# CLASSIFICATION MAP: candidate_id_partial -> (system_name, subsystem_name)
# ============================================================

classifications = {
    # TypeSpec, Contracts & Code Generation
    "045da9bc-997": ("TypeSpec, Contracts & Code Generation", None),  # Helidon as Contract-Fulfilling Runtime
    "120651f7-ebc": ("TypeSpec, Contracts & Code Generation", None),  # Specification as Operating System
    "14ac6427-146": ("TypeSpec, Contracts & Code Generation", None),  # Multiple Parallel System Realities
    "15513650-d4d": ("TypeSpec, Contracts & Code Generation", None),  # Agentic Workflows w/ Spec Artifacts
    "25215988-11c": ("TypeSpec, Contracts & Code Generation", None),  # Formalize Contracts w/ TypeSpec
    "20fb28af-149": ("TypeSpec, Contracts & Code Generation", "Compiler Pipeline"),  # Compiler Pipeline for Specs
    "61abcc6f-385": ("TypeSpec, Contracts & Code Generation", None),  # Spec-Driven Orchestration Platform
    "50d39b0a-a32": ("TypeSpec, Contracts & Code Generation", None),  # Contract-Driven Workflow for AI Code Gen
    "9b9161b8-08c": ("TypeSpec, Contracts & Code Generation", None),  # TypeSpec -> TSP-Output -> Refactor
    "88c2cfaf-081": ("TypeSpec, Contracts & Code Generation", None),  # TypeSpec as Canonical Contract
    "b1817baa-d56": ("TypeSpec, Contracts & Code Generation", None),  # TypeSpec as Controlling Layer
    "a0e2e6c9-b0c": ("TypeSpec, Contracts & Code Generation", None),  # TypeSpec as Source of Truth
    "88bb015b-4ee": ("TypeSpec, Contracts & Code Generation", None),  # TypeSpec as Executable Knowledge Layer
    "7ecc591a-767": ("TypeSpec, Contracts & Code Generation", None),  # Layered TypeSpec
    "baa09c9a-2a5": ("TypeSpec, Contracts & Code Generation", None),  # Leverage OpenAPI
    "e0c4535f-9bd": ("TypeSpec, Contracts & Code Generation", None),  # OpenAPI as Reflection
    "fb2d41f6-1c1": ("TypeSpec, Contracts & Code Generation", None),  # OpenAPI as Reflection Not Design
    "d433ed95-3be": ("TypeSpec, Contracts & Code Generation", None),  # OpenAPI as Subset
    "771ae8da-a40": ("TypeSpec, Contracts & Code Generation", None),  # Structural Typing
    "8702c1a2-2e3": ("TypeSpec, Contracts & Code Generation", None),  # Model Intent Not Implementation
    "63d24a87-e30": ("TypeSpec, Contracts & Code Generation", None),  # Formalize Change as SpecChange
    "bd278214-70f": ("TypeSpec, Contracts & Code Generation", None),  # Governor for Spec Evolution
    "913a9f8c-41e": ("TypeSpec, Contracts & Code Generation", None),  # Visual Spec Designer
    "f5e8afd6-e11": ("TypeSpec, Contracts & Code Generation", None),  # Versioned Deterministic Workflow
    "8a48af46-05d": ("TypeSpec, Contracts & Code Generation", None),  # Spec-Driven Orchestration w/ TypeSpec
    "87c667fe-7bd": ("TypeSpec, Contracts & Code Generation", None),  # Contract-First Version-Controlled
    "cf676c9d-f36": ("TypeSpec, Contracts & Code Generation", None),  # Arbiter as Bootstrap Accelerator

    # Agentic Pipeline Overview
    "046344fb-b6a": ("Agentic Pipeline Overview", None),  # Conduit as Commitment Boundary
    "b2a440ac-471": ("Agentic Pipeline Overview", None),  # Nexus as Personal Control Plane
    "cbc72dad-82a": ("Agentic Pipeline Overview", None),  # Define Nexus as Personal Control Plane
    "84504422-64c": ("Agentic Pipeline Overview", None),  # Nexus as Code-Native EA Tool
    "ee91a7cc-751": ("Agentic Pipeline Overview", None),  # Code-Native EA Tooling
    "9a196b0d-db4": ("Agentic Pipeline Overview", None),  # Architecture-First Approach
    "62099f6c-ae1": ("Agentic Pipeline Overview", None),  # Layered Architecture for AI
    "b04c01dc-d15": ("Agentic Pipeline Overview", None),  # Two-Tier Ecosystem
    "19f26bd1-0b6": ("Agentic Pipeline Overview", None),  # Create Two-Tier Ecosystem
    "411399bc-a44": ("Agentic Pipeline Overview", None),  # Vision as Event Producer in LOSM
    "75588861-312": ("Agentic Pipeline Overview", None),  # Conduit as Stabilizing Controller
    "f4434ccf-0b8": ("Agentic Pipeline Overview", None),  # Agentic Workflow Orchestration Layer
    "4fa7e209-e1c": ("Agentic Pipeline Overview", None),  # Semantic Plans vs Execution Tickets
    "39fc7b6a-045": ("Agentic Pipeline Overview", None),  # Separate Request Identity from Execution

    # Agent Architecture & Leases
    "570b5d04-0c2": ("Agent Architecture & Leases", None),  # Externalize Cognitive Functions
    "0d5cdebc-093": ("Agent Architecture & Leases", None),  # Shift Boundary to Execution Semantics
    "20ce007c-dc1": ("Agent Architecture & Leases", None),  # Split Level Field Meaning
    "6e6a24cc-e39": ("Agent Architecture & Leases", None),  # Separate Reasoning Regimes
    "cae4bad0-da8": ("Agent Architecture & Leases", None),  # Emergent Modes over Configurable
    "f88700a4-d35": ("Agent Architecture & Leases", None),  # Conduit as Recovery Surface
    "873c3581-bdc": ("Agent Architecture & Leases", "Cognitive Runtime"),  # Cognitive CPU Scheduler
    "72f00103-77f": ("Agent Architecture & Leases", None),  # Role Leases w/ Semantic Policies
    "5ec4c047-a65": ("Agent Architecture & Leases", None),  # Decouple Auth from UI Layer

    # Governance, Policy & Constitution
    "06f6acb8-580": ("Governance, Policy & Constitution", None),  # Self-Regulating Software Ontology
    "5fdbe06d-add": ("Governance, Policy & Constitution", None),  # Vision as Cohesive Worldview
    "5f60e77f-2f9": ("Governance, Policy & Constitution", None),  # Federated Read Path as Steward
    "9127c5f2-09a": ("Governance, Policy & Constitution", None),  # Self-Modeling for Optimization
    "336e814e-f2e": ("Governance, Policy & Constitution", None),  # Roundtable Arbitration Model

    # Knowledge Infrastructure & Ontology
    "1e6a9791-89b": ("Knowledge Infrastructure & Ontology", None),  # Temporal Property Graph
    "366c6af5-c36": ("Knowledge Infrastructure & Ontology", None),  # Formalize Nexus Topology Schema
    "43e49ee7-78d": ("Knowledge Infrastructure & Ontology", None),  # JSON-LD Graph-Native Topology
    "e072fc0e-eb9": ("Knowledge Infrastructure & Ontology", None),  # Graph Query API
    "e102bdd9-baa": ("Knowledge Infrastructure & Ontology", None),  # UI-Graph Mutation Layer
    "3d26e173-de5": ("Knowledge Infrastructure & Ontology", None),  # Reality-Binding Layer
    "8e2a0e58-b44": ("Knowledge Infrastructure & Ontology", None),  # Semantic Adjacency Bridge
    "31dc5e69-cd5": ("Knowledge Infrastructure & Ontology", None),  # Projection Engine
    "fd786f57-797": ("Knowledge Infrastructure & Ontology", None),  # Nexus as Query/Projection Backend
    "3f39c986-8cb": ("Knowledge Infrastructure & Ontology", None),  # ReplayService
    "a7175a9e-606": ("Knowledge Infrastructure & Ontology", None),  # Separate Data Roles
    "b93daa33-ec1": ("Knowledge Infrastructure & Ontology", None),  # Steward as System Boundary
    "5eca12e5-fac": ("Knowledge Infrastructure & Ontology", None),  # Differentiate KG Mutation
    "808c64e8-769": ("Knowledge Infrastructure & Ontology", None),  # Identity-Driven Objects
    "81fa43ad-895": ("Knowledge Infrastructure & Ontology", None),  # Graph Database for System Reality

    # UI, Component & Developer Experience
    "22e5118f-9c3": ("UI, Component & Developer Experience", None),  # Self-Composing UIs
    "a2e63618-b6a": ("UI, Component & Developer Experience", None),  # Deterministic UI Projection Engine
    "e4db870d-085": ("UI, Component & Developer Experience", None),  # Throttler as Saved ViewSpec

    # Broker/Mesh & Service Infrastructure
    "b861696f-75d": ("Broker/Mesh & Service Infrastructure", None),  # Pluggable Gateway Architecture
    "dc1752bb-059": ("Broker/Mesh & Service Infrastructure", None),  # Policy Envelopes for Service Segmentation
    "51146cb3-2b2": ("Broker/Mesh & Service Infrastructure", None),  # Preserve Layering in MessageBox

    # PEB Kernel / Semantic Kernel
    "d46df364-bbe": ("peb-kernel", None),  # Semantic Kernel for Platform Understanding
    "b8f2e20e-ff2": ("peb-kernel", None),  # Nexus Self-Description Capability
    "0e8f25dd-f56": ("peb-kernel", None),  # Shrapnel as Core Abstraction Layer

    # Event-Driven Architecture
    "e4124a32-18e": ("Event-Driven Architecture", None),  # Multi-Stage Control System

    # AI Engineering & Agent Quality
    "1dd86590-b08": ("AI Engineering & Agent Quality", None),  # AI as Amplifier

    # JVM Services
    "978e6af1-2b4": ("JVM Services", "Helidon"),  # Helidon as Implementation Layer
    "10081e40-123": ("JVM Services", None),  # Java/Ballerina as Primary

    # TypeScript Services
    "65eb5380-bb3": ("TypeScript Services", None),  # Node/TS as Runtime Lens
    "fbc9b598-00b": ("TypeScript Services", None),  # Pragmatic TS/TypeSpec Pairing

    # Agent Bootstrap (career/resume type)
    "5f44ac5c-be8": ("Agent Bootstrap", None),  # Pattern Recognition Platform Shifts
    "f92dcc43-014": ("Agent Bootstrap", None),  # Reframing Career Trajectory
    "895a5abf-ae6": ("Agent Bootstrap", None),  # Modernizing C++ IP
    "4c6c89fc-0fb": ("Agent Bootstrap", None),  # Company Evaluation Checklist
    "84e7252d-26b": ("Agent Bootstrap", None),  # Structured Document Surface
    "17eb7e49-93f": ("Agent Bootstrap", None),  # .NET Experience
    "2317a930-f71": ("Agent Bootstrap", None),  # Frame C++ IP Modernization

    # Tools & Scripts
    "59bf51a9-11a": ("Tools & Scripts", None),  # 3D Topology Visualization
}

# ============================================================
# EXECUTION
# ============================================================

import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--dry-run", action="store_true")
args = parser.parse_args()

log.info("=" * 60)
log.info("Classifying %d unmapped candidates", len(classifications))

# Get full candidate IDs from DB
rc, out = psql("SELECT id, title FROM nebula.harvest_candidates WHERE status = 'pending' AND system_id IS NULL AND subsystem_id IS NULL AND feature_id IS NULL;")
unmapped = {}
for line in out.split("\n"):
    parts = line.split("|", 1)
    if len(parts) == 2:
        unmapped[parts[0][:12]] = (parts[0], parts[1])

log.info("Found %d unmapped in DB", len(unmapped))

updated = 0
not_found = 0

for short_id, (sys_name, sub_name) in classifications.items():
    if short_id not in unmapped:
        log.warning("  NOT FOUND in DB: %s", short_id)
        not_found += 1
        continue
    
    full_id, title = unmapped[short_id]
    sid, subid = resolve(sys_name, sub_name)
    
    if not sid:
        log.error("  NO SYSTEM MATCH: %s -> %s", title[:50], sys_name)
        continue
    
    if args.dry_run:
        status = "DRY"
        updated += 1
    else:
        # Update candidate in DB
        sql = f"UPDATE nebula.harvest_candidates SET system_id = '{sid}'"
        if subid:
            sql += f", subsystem_id = '{subid}'"
        sql += f" WHERE id = '{full_id}';"
        rc, _ = psql(sql)
        if rc == 0:
            # Cascade event: candidate.classified
            try:
                emit_candidate_classified(
                    candidate_id=full_id,
                    system_id=sid,
                    subsystem_id=subid,
                    source="rover.batch_classify_unmapped",
                )
            except Exception as e:
                log.debug("  candidate.classified emission failed: %s", e)

            # Create cross-reference for system
            xref_body = {
                "sourceType": "harvest_candidate",
                "sourceId": full_id,
                "targetType": "system",
                "targetId": sid,
                "relType": "classified_as",
                "metadata": {"candidateTitle": title[:80], "targetName": sys_name}
            }
            nebula_post("/cross-references", xref_body)
            if subid:
                xref_body2 = {
                    "sourceType": "harvest_candidate",
                    "sourceId": full_id,
                    "targetType": "subsystem",
                    "targetId": subid,
                    "relType": "classified_as",
                    "metadata": {"candidateTitle": title[:80], "targetName": f"{sys_name}/{sub_name}"}
                }
                nebula_post("/cross-references", xref_body2)
            status = "OK"
            updated += 1
        else:
            status = "FAIL"
    
    sub_str = f" → {sub_name}" if sub_name else ""
    log.info("  %s [%s] %s → %s%s", status, short_id, title[:50], sys_name, sub_str)

log.info("=" * 60)
log.info("Done: %d updated, %d not found", updated, not_found)
