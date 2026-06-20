# Approved Plan: Define IRL↔IR Bridge — Bayesian Observer Meets Type System

**Status:** `Agreed`
**Source:** Harvested from `IRL IR Interaction System.html`
**Harvest Ref:** `irl-ir-interaction-system-harvested.md` #2

## Architectural Intent
The relationship between IRL and IR is: IRL = Bayesian observer over interaction space (probabilistic classification: soft labels), IR = type system over interaction space (deterministic archetype selection: hard constraint). The pipeline flows: User Input → IRL probabilistic classification → Interaction Taxonomy Resolver → IR deterministic archetype selection → Authority Graph mutation rules. Key invariant: IRL never decides structure. It only proposes probability mass over IR types.

## Requirements & Acceptance Criteria
- [ ] IRL must produce probability distribution over IR archetypes — never a single answer
- [ ] IR must enforce closed-contract deterministic selection from IRL's proposals
- [ ] IRL must never directly decide structure or mutation rules
- [ ] The bridge must preserve the 'closed contract' property of IR

## Files Affected
- `nexus/python/vision/losm-ir/` — IR types and resolver
- `nexus/python/` — IRL classifier (new)

## Dependencies
- MEEP bootstrap (Plan #021) provides the implementation skeleton
- InteractionIntentVector (Plan #024) formalizes IRL output

## Unresolved Follow-Ups
- What is the exact mapping between IRL probabilistic archetypes and IR deterministic archetypes?
- How is the probability threshold for IR selection determined?
