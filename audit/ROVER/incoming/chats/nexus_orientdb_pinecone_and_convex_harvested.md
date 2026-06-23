# Harvested Specification & Code Repository

**Source:** `chats/Nexus - OrientDB, Pinecone & Convex.html`
**Model:** DeepSeek V4 (manual extraction)
**Batch:** 7
**Total candidates:** 3

---

## 1. Three-Database Architecture — OrientDB (Structured), Pinecone (Vector), Convex (Metadata/UX State)
**Status:** `Agreed`

### Architectural Intent
Define a three-database architecture with distinct roles: OrientDB handles structured data and graph modeling (relationships between components/services). Pinecone handles vector embeddings for semantic similarity, fuzzy matching, and discovery. Convex (local) acts as the local live-updating source of truth for project metadata, Kanban state, and subsystem information — operating independently of API keys or remote hosting. Filesystem (Throttler/Nexus) becomes a read-only display layer. Convex is the authoritative metadata and UX state source.

### Requirements & Acceptance Criteria
- [ ] OrientDB: structured data, graph relationships, dependency modeling
- [ ] Pinecone: vector embeddings, semantic similarity search
- [ ] Convex: authoritative metadata, live-updating UX state, local-only operation
- [ ] Filesystem = dumb display layer, not metadata authority
- [ ] Three parallel hierarchies: FS (visual), Convex (metadata), Services (runtime)

---

## 2. ETL/Sync Architecture — One-Way Default with File-Driven or Convex-Driven Options
**Status:** `Agreed`

### Architectural Intent
Define ETL/sync strategy across three worlds: Filesystem/Throttler (dumb display), Convex (metadata authority), Services Registry (runtime state). Two main approaches: File-Driven (source of truth = folders/.magnet markers, ETL into Convex) and Convex-Driven (source of truth = Convex collections, updates flow to FS). Recommended hybrid: start with file-driven ETL into Convex for bootstrap, then Convex becomes authoritative. Two-way sync can be layered later. Conflicts (FS renames vs Convex updates) require stable IDs and reconciliation.

### Requirements & Acceptance Criteria
- [ ] One-way default: FS → Convex for bootstrap, then Convex is authoritative
- [ ] Convex nodes store metadata: projects, subsystems, features, Kanban state
- [ ] Live updates from Convex via live queries
- [ ] Conflict resolution for FS renames vs Convex state
- [ ] .magnet folders store optional embeddings for Throttler display
- [ ] Services → Convex incremental ETL for registry metadata

---

## 3. Knowledge Topology vs Knowledge Graph — Taxonomy vs True Graph
**Status:** `Observed`

### Architectural Intent
Distinguish between folder structures (taxonomy — hierarchical, tree-based) and true knowledge graphs (nodes + edges with typed relationships). Folder-based navigation (Throttler) is taxonomy; OrientDB/Pinecone enable true graph traversal. Magnets/Identity concept: shared identities across folder contexts enable cross-cutting views without duplicating folder structure. 'Folders are views, magnets are identities.'

### Requirements & Acceptance Criteria
- [ ] Taxonomy: hierarchical folder structure for navigation
- [ ] Knowledge graph: typed nodes and edges for traversal
- [ ] Magnets as cross-cutting identities that bridge folder contexts
- [ ] Nebula's project/Kanban/Convex capabilities integrated without vendor lock-in

---
