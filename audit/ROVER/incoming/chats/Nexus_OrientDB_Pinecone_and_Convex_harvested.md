# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Nexus - OrientDB, Pinecone & Convex.html
**Model:** DeepSeek V4
**Total candidates:** 2
---
## 1. Three-Database Architecture — OrientDB (Structured), Pinecone (Vector), Convex (Metadata/UX State)
**Status:** `Agreed`

### Architectural Intent
Define a three-database architecture with distinct roles: OrientDB handles structured data and graph modeling (relationships between components/services, structured dependencies). Pinecone handles vector embeddings for semantic similarity, fuzzy matching, and discovery. Convex (local) acts as the local live-updating source of truth for project metadata, Kanban state, and subsystem information — operating independently of API keys or remote hosting. Filesystem (Throttler/Nexus) becomes a dumb read-only display layer. Convex is the authoritative metadata and UX state source.

### Requirements & Acceptance Criteria
- [ ] OrientDB: structured data, graph relationships, dependency modeling
- [ ] Pinecone: vector embeddings, semantic similarity, fuzzy discovery
- [ ] Convex: project metadata, Kanban state, UX state — live-updating
- [ ] Filesystem: read-only display layer for folder structure
- [ ] ETL: one-way incremental from files/services to Convex
- [ ] Convex live queries for instant UI state reflection

---

## 2. ETL Strategy — One-Way Incremental Bootstrapping from Filesystem to Convex
**Status:** `Agreed`

### Architectural Intent
Define a one-way, incremental ETL process: files/services bootstrap metadata into Convex nodes, which then become the source of truth for the UI. The filesystem and service mesh are content sources; Convex is the metadata and UX state registry. This enables overlaying project/Kanban panels (Nebula) without tight coupling or vendor lock-in. Convex live queries reflect state changes instantly in the UI. No bidirectional sync — Convex is authoritative after ingestion.

### Requirements & Acceptance Criteria
- [ ] One-way ETL: files/services → Convex
- [ ] Convex is authoritative metadata source after ingestion
- [ ] No bidirectional sync — avoids split-brain
- [ ] Filesystem remains content source, not metadata source
- [ ] Convex live queries for instant UI updates
- [ ] Nebula overlays project/Kanban panels on Convex state

---
