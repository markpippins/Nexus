# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Codex Session Planning.html
**Model:** DeepSeek V4
**Total candidates:** 3
---
## 1. Semantic Projection Migration — Four-Phase Refactor (A-D) for Separating Semantic Artifacts from Replay State
**Status:** `Specified`

### Architectural Intent
Execute a four-phase migration (Phase A-D) to refactor semantic projections in LOSM, separating semantic artifacts from replay state. Phase A: extract projection definitions and make them injectable. Phase B: move projection storage to dedicated store. Phase C: implement projection lifecycle management with versioning. Phase D: full decoupling with independent deployment. The migration is structured as a Codex Prompt Pack — a formalized migration contract with phased operations, verification checkpoints, and preservation requirements.

### Requirements & Acceptance Criteria
- [ ] Phase A: Extract projection definitions, make injectable (no behavioral change)
- [ ] Phase B: Move projection storage to dedicated store module
- [ ] Phase C: Implement projection lifecycle with versioned snapshots
- [ ] Phase D: Full decoupling — projections deployable independently
- [ ] Each phase must preserve existing LOSM kernel invariants
- [ ] Verification checkpoint after each phase before proceeding

---

## 2. Codex Prompt Pack — Formalized Migration Contract as Structured Prompt + Requirements
**Status:** `Agreed`

### Architectural Intent
Define a Codex Prompt Pack as a structured migration contract combining: a Codex prompt at the top (multi-phase orchestration plan), a preservation requirements section (constraints to protect invariants), and a long-term trajectory section (context on how this refactor fits into broader goals). This serves as both the implementation guide and the audit trail — preventing architectural drift while ensuring behavioral parity.

### Requirements & Acceptance Criteria
- [ ] Codex prompt: multi-phase orchestration with clear phase boundaries
- [ ] Preservation requirements: explicit invariants to protect during migration
- [ ] Long-term trajectory: how this refactor connects to LOSM-Lang
- [ ] Verification after each phase: tests must pass, behavior unchanged
- [ ] Pack serves as both implementation guide and audit record

---

## 3. LOSM Preservation Requirements — Kernel Invariants and Ownership Boundaries During Refactoring
**Status:** `Specified`

### Architectural Intent
Define the invariant set that must be preserved during any LOSM refactoring: (1) package boundaries — kernel/store/shell/host separation must not be violated, (2) lifecycle path — Load → Validate → Execute → Emit → Persist sequence must remain intact, (3) semantic authority — only the kernel can interpret meaning, (4) ownership boundaries — no cross-package dependency inversion except through defined interfaces, (5) replay determinism — any migration must preserve deterministic replay capability.

### Requirements & Acceptance Criteria
- [ ] Package boundary invariant: kernel/store/shell/host layers must not blur
- [ ] Lifecycle invariant: Load → Validate → Execute → Emit → Persist sequence preserved
- [ ] Semantic authority: only kernel interprets meaning
- [ ] Ownership invariant: no cross-package dependency inversion
- [ ] Replay determinism: must remain verifiable after migration

---
