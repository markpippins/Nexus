# Approved Plan: Formalize LOSM as a Dual-Mode Cognitive Operating System

**Status:** `Agreed`
**Source:** Harvested from `Reviewing LOSM Risk Management System.html`
**Harvest Ref:** `losm-risk-management-harvested.md` #3

## Architectural Intent
Recognize that LOSM has evolved from an agentic pipeline into a cognitive operating system with two execution modes: Conduit (governed, temporal-backed, multi-role kernel-mode cognition) and harnessed NATS subscribers (ungoverned, opportunistic, distributed user-mode cognition). The system now consists of Conduit (WorkRequest Processing Unit), Absorb (ingest parser/semantic membrane), Nebula (intent marketplace queue), Vector (state snapshot system/temporal substrate), and the Knowledge Graph (semantic nervous system).

## Requirements & Acceptance Criteria
- [ ] WorkRequests must flow through roles, each embodied by models with their own context slices
- [ ] WorkRequests can contain DAGs of WorkRequests
- [ ] Strategies, tactics, introspection, reflection, and plans must be first-class citizens
- [ ] Absorb must convert HTML→DocLing→structured semantic substrate→Vector snapshots
- [ ] Nebula must stage work items, requests, tasks, requirements, and analysis artifacts as an intent marketplace
- [ ] Vector must snapshot state, WorkRequests, plans, analysis, and knowledge graph state
- [ ] Knowledge Graph must represent Roles, Plans, Strategies, Tactics, Requirements, WorkRequests, DAGs, Snapshots, State, Code, Intent, Interpretations, and Topologies as nodes with typed edges and lifecycle semantics

## Files Affected
- `nexus/python/conduit/` — governed execution substrate
- `nexus/python/rover/` — Absorb perception layer
- `nexus/` — Nebula, Vector, Knowledge Graph subsystems

## Dependencies
- Semantic IR definition (Plan #001) provides the semantic substrate
- NBK provides the execution kernel

## Unresolved Follow-Ups
- Need to formalize: canonical ontology, type system for WorkRequests, lifecycle semantics for nodes, evaluation semantics for DAGs, role contracts, graph invariants, execution invariants, reflection/introspection protocols, governance rules for Conduit vs NATS workers
- Should we pick next: Define WorkRequest type system, specify WorkRequest lifecycle, define role contracts, formalize knowledge graph ontology, or define Conduit vs NATS execution semantics?
