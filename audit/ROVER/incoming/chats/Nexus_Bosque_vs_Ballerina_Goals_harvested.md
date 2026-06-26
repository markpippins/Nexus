# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Nexus - Bosque vs Ballerina Goals.html
**Model:** DeepSeek V4
**Total candidates:** 1
---
## 1. IR-First Design — TypeSpec as Intermediate Representation for Code Generation
**Status:** `Agreed`

### Architectural Intent
Design the system IR-first: code generation derives from a canonical IR (TypeSpec) rather than the IR being derived from code. This inverts the traditional direction. TypeSpec becomes the canonical system model — the intermediate representation from which all implementations (code, SDKs, docs, tests) are generated. Bosque's research focus on determinism and machine-reasoning informs the IR design, while Ballerina's pragmatic integration focus influences the execution layer. The IR approach enables the system to eventually rewrite itself.

### Requirements & Acceptance Criteria
- [ ] TypeSpec as canonical IR — code derives from it
- [ ] IR-first: design the intermediate representation before implementations
- [ ] Bosque-inspired: determinism and machine-reasoning in IR design
- [ ] Ballerina-inspired: pragmatic integration and service orientation in execution
- [ ] IR enables self-rewriting system — system rewrites code via IR
- [ ] File Service TypeSpec as first canonical capability demonstration

---
