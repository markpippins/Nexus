# Approved Plan: Implement Structural Risk Management as Governance Substrate

**Status:** `Agreed`
**Source:** Harvested from `Reviewing LOSM Risk Management System.html`
**Harvest Ref:** `losm-risk-management-harvested.md` #4

## Architectural Intent
Build a complete end-to-end risk lifecycle (detection → classification → escalation → structured resolution → long-term learning) expressed as schemas, protocols, and graph-level reasoning. Risk is treated as structural pattern matching (compiler mindset) rather than event detection (compliance mindset). The system continuously senses, classifies, escalates, resolves, and learns from risk signals across the entire semantic filesystem.

## Requirements & Acceptance Criteria
- [ ] Risk Blocker Schema must be a typed artifact that routes itself through the governance graph
- [ ] Failure Pattern Matching Protocol must detect structural risk before execution, even when content appears benign
- [ ] Ambiguity Signature Model must detect underspecified, overdetermined, incoherent artifacts and model disagreement
- [ ] Ambiguity Score Function and Localization Algorithm must be defined
- [ ] Ambiguity Resolution Ledger and Clarity Evolution Model must track resolution state
- [ ] Escalation choreography must follow: Tester → Architect → Topologist → Inspector → Steward → Engineering → Human
- [ ] Risk must be represented as a filesystem tree: /Governance/Risk/{Blockers, OpenQuestions, Ambiguity, Resolutions}

## Files Affected
- `nexus/python/` — new risk management subsystem
- `nexus/audit/` — risk artifacts as filesystem tree

## Dependencies
- Semantic IR definition (Plan #001) — risk operates on Semantic IR, not raw text
- NBK kernel — provides execution truth for risk detection

## Unresolved Follow-Ups
- Should we define the Report Schema next, or go deeper into how the orb's clarity signal is computed from the ambiguity ledger and resolution history?
- What is the exact schema for the Report Schema that ties risk detection, ambiguity detection, escalation, resolution, and clarity evolution into a single execution loop?
