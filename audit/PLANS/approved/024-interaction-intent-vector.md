# Approved Plan: InteractionIntentVector — Formal IRL Output Contract

**Status:** `Proposed`
**Source:** Harvested from `IRL IR Interaction System.html`
**Harvest Ref:** `irl-ir-interaction-system-harvested.md` #8

## Architectural Intent
IRL needs a strictly typed output contract so it can be used as compiler input rather than just a freeform classifier. InteractionIntentVector formalizes: archetype_distribution (Map<IRL_Archetype, probability>), confidence (float), entropy (float), suggested_IR_candidates ([IR_Archetype]), constraint_flags ([...]).

## Requirements & Acceptance Criteria
- [ ] InteractionIntentVector must include typed archetype_distribution with probabilities
- [ ] Must include confidence and entropy metrics for the classification
- [ ] Must include suggested IR candidate archetypes for deterministic selection
- [ ] Must include constraint flags for downstream enforcement

## Files Affected
- `nexus/python/rover/schemas.py` — IRL schema definitions
- `nexus-meep/irl/` — classifier output format

## Dependencies
- IRL↔IR bridge (Plan #018) defines the semantic context
- MEEP bootstrap (Plan #021) is the implementation target

## Unresolved Follow-Ups
- What is the exact schema — Pydantic model or dataclass?
- How does entropy inform downstream IR selection thresholds?
