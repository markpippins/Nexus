---
project: nexus
session: current
---

# Prompt 0088: PEB MCP spec critique and revision

## Summary

Received critique of PEB-as-MCP-server design (v1). Major structural flaws identified: tool explosion problem (10 independent tools with implicit sequencing), hash recomputation cost (O(n) full SHA256), prompts embedding policy logic (dual enforcement paths), static authority matrix (not composable), missing admission control layer, and missing state/trace/decision authority boundary.

## Work Done

1. **Analyzed 2 new transcripts:** Semantic Adapter Layer (harness-as-data, execution modes) and Plurality and Agent Disagreement (Transform signature, WorkRequest quality triangle, operational fitness function) — added as sections 18-19 to ANALYSIS.md

2. **Expanded ANALYSIS.md:** Added 2 new sections (18-19), expanded vocabulary map with 6 terms, added 2 new gaps (#12 semantic harness registry, #13 formal Transform signature), updated status to "11 transcripts analyzed"

3. **Designed PEB-as-MCP-server spec (v2):** Complete rewrite at graph/peb-mcp-spec.md (890 lines):
   - Kernel inversion: PebGovernanceEngine with PebTransaction as single mutation path
   - Admission Control Layer gates every tool invocation
   - Capability-based authority tokens replace static role→action matrix
   - Incremental Merkle hashing (O(1) per mutation, not O(n))
   - Prompts are informational-only (hashes, URIs, summaries — no enforcement)
   - State/Decision/Trace authority boundary explicitly encoded
   - peb_transactions audit table for complete mutation traceability
   - 4-phase kernel-first implementation plan

## Key Decisions

- PEB is a deterministic state transition kernel with MCP as interface — not a system of tools
- Prompts and tools must never duplicate enforcement (tool wins on conflict)
- Traces are observational only — never feed state computation
- First implementation phase is kernel core + storage (no decision recording yet)
