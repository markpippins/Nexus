# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Worker Context and Drift.html
**Model:** DeepSeek V4
**Total candidates:** 1
---
## 1. Multimodal Event-Driven Cognitive OS — Unified Event Substrate for All Modalities
**Status:** `Proposed`

### Architectural Intent
Extend the system's definition of what counts as an event that can become knowledge. Text events come from linguistic cognition; vision events come from perceptual cognition. All modalities compile into LOSM IR primitives before being allowed to affect truth, memory, or action. A Perception Compiler stage (analogous to AST layer for text) normalizes vision inputs into Percept IR with entity, relation, state, uncertainty, temporal tag, and provenance fields. Everything goes through LOSM compilation — perception must not directly mutate interpretation or authority.

### Requirements & Acceptance Criteria
- [ ] Perception Compiler normalizes vision inputs into LOSM Percept IR: entity, relation, state, uncertainty, temporal tag, provenance
- [ ] Vision events enter via Message Box exactly like text events — no special casing
- [ ] Vector becomes multimodal state projection layer indexing WorkRequests, KG state, conversation events, AND percept events
- [ ] KG becomes grounding layer for perception: entity resolution from vision, persistent objects, identity tracking across frames
- [ ] Conduit must treat percept events exactly like WorkRequests: classify → lease check → KG update or reject

### Harvested Code Artifacts
#### Purpose: LOSM Percept IR — vision event normalized into semantic contract
```json
{"type":"PERCEPT_EVENT","source":"vision","entities":[{"id":"car_1","class":"vehicle","confidence":0.92},{"id":"person_2","class":"human","confidence":0.88}],"relations":[{"type":"inside","from":"person_2","to":"car_1"}],"temporal":"t=frame_1832","uncertainty":0.15}
```

### Unresolved Follow-Ups
- What is the formal Percept IR schema — does it extend or compose with WorkRequest IR?
- How does entity resolution work across frames — is identity tracking done by KG or by the Perception Compiler?

---
