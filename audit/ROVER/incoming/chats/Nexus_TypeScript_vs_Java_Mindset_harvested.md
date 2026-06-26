# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Nexus - TypeScript vs Java Mindset.html
**Model:** DeepSeek V4
**Total candidates:** 1
---
## 1. Constraint-Oriented Design Principle — Arrays over Objects, Explicit State, No Hidden Allocation
**Status:** `Agreed`

### Architectural Intent
Define Constraint-Oriented Design as an explicit design principle: use fixed-size arrays and explicit indexing over objects for tightly coupled state; separate data from behavior; avoid hidden allocation during critical paths; choose explicit state over inferred state. This is hardware-style thinking applied to software — the mapping between code and behavior is tight, there are fewer hidden layers, and constraints are real (not advisory). The result is high conceptual density systems where the developer can reason about the entire system at once.

### Requirements & Acceptance Criteria
- [ ] Fixed-size arrays over objects for tightly coupled state
- [ ] Explicit indexing over object references
- [ ] No hidden allocation during critical execution paths
- [ ] Explicit state over inferred state — no magic
- [ ] Constraints are real, not advisory — enforce at data structure level
- [ ] High conceptual density enables whole-system reasoning

---
