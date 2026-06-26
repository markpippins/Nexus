# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Nexus - Nexus Knowledge Base.html
**Model:** DeepSeek V4
**Total candidates:** 3
---
## 1. Nexus Knowledge Base Architecture — Four-Layer Indexing from Transcripts to Structured Knowledge
**Status:** `Implemented`

### Architectural Intent
Design a knowledge base architecture that transforms raw chat transcripts into a structured, navigable knowledge system. Four indexing layers: (1) Q&A — historical index of conversations with explicit problems and answers, (2) Ideas — conceptual index of 'knowledge atoms' (abstract constructs, ontological insights), (3) Technology — concrete implementation tools (Helidon, Ballerina, MCP, TypeSpec), (4) Lore — reflective/narrative index tracking the evolution of the Nexus concept itself (origin stories, metaphors, philosophy, civics framing, design intent). Lore is critical for preserving 'why' behind architectural decisions. Storage evolves from Markdown files to MongoDB ingestion.

### Requirements & Acceptance Criteria
- [ ] Four-layer index: Q&A, Ideas, Technology, Lore
- [ ] Lore preserves design intent and narrative continuity
- [ ] Markdown-based storage as initial substrate
- [ ] MongoDB as eventual scalable backend
- [ ] Extracted from raw transcripts via structured export pass

---

## 2. B-Layer Reflection — Separating Metacognitive Asides from Raw Knowledge Content
**Status:** `Agreed`

### Architectural Intent
Define the B-Layer as a separate capture channel for asides, analogies, and meta-cognitive reflections during conversations. This tracks the user's own thinking process separately from the raw information being discussed. The B-Layer captures: why a particular analogy was striking, what emotional reaction occurred during a realization, how the user's understanding evolved across the conversation, and which connections the user drew spontaneously. This prevents metacognitive context from being lost during knowledge extraction.

### Requirements & Acceptance Criteria
- [ ] B-Layer separate from Q&A/Ideas/Technology/Lore indexes
- [ ] Captures: why analogies struck, emotional reactions to realizations, evolving understanding, spontaneous connections
- [ ] Prevents loss of metacognitive context during extraction
- [ ] Linked to primary index entries via cross-reference

---

## 3. Nexus Interface Vision — Throttler Treeview + Context-Aware Chatbot + Markdown Notepad
**Status:** `Proposed`

### Architectural Intent
Design the Nexus UI as three panels: (1) Throttler treeview — navigates project paths with heirarchical artifact views, (2) Context-aware chatbot — panel keyed to the active treeview path, leveraging the knowledge graph for contextual responses, (3) Markdown notepad — for meeting notes and documentation, automatically linked to the active path and artifact graph. The interface serves as a 'thinking environment' rather than a document repository, treating AI more as a thinking partner than a tool.

### Requirements & Acceptance Criteria
- [ ] Throttler treeview for hierarchical project/artifact navigation
- [ ] Chatbot panel context-aware based on active treeview path
- [ ] Markdown notepad auto-links to active path and artifact graph
- [ ] Interface is a thinking environment, not a document repository
- [ ] AI treated as thinking partner, not tool

---
