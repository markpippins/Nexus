# Harvested Specification & Code Repository

**Source:** `chats/Nexus - Database Deprecation Reasons.html`
**Model:** DeepSeek V4 (manual extraction)
**Batch:** 7
**Total candidates:** 3

---

## 1. Micro-Repository Pattern Critique — Verbose, Rigid, Non-Scalable
**Status:** `Observed`

### Architectural Intent
Analyze a deprecated Database interface pattern that exposed FindAll/FindOne/Save/Delete interfaces for each entity type via explicit getters. The pattern looked elegant initially (uniform CRUD access) but scaled poorly: each new entity type added four getters, special queries broke the pattern, and parallel helper classes were required. This is the abstraction scaling trap — initial elegance becomes maintenance burden as the entity universe grows.

### Requirements & Acceptance Criteria
- [ ] Micro-repositories: FindAll/FindOne/Save/Delete per entity
- [ ] Database interface: service locator/facade for all entity repos
- [ ] Scales poorly: 4N getters for N entities
- [ ] Special queries break the strict CRUD pattern
- [ ] Parallel helpers required for non-standard operations

---

## 2. Repository<T, ID> as Modern Alternative — Generic, Type-Safe, Extensible
**Status:** `Agreed`

### Architectural Intent
Replace the micro-repository facade with a generic Repository<T, ID> pattern. Single interface per entity with findById/findAll/save/delete operations. Custom queries added per-entity via extension. Generic repositories are injected via DI (Spring/Micronaut) where needed, eliminating the monolithic Database facade. This scales cleanly: 1 interface per entity, not 4N methods.

### Requirements & Acceptance Criteria
- [ ] Generic Repository<T, ID> interface
- [ ] findById, findAll, save, delete core operations
- [ ] Custom queries via per-entity extension
- [ ] Dependency injection for selective repository access
- [ ] Compatible with Spring Data, Micronaut Data

---

## 3. Abstraction Scaling Trap — Rigid Micro-DSL Patterns vs Flexible Generics
**Status:** `Observed`

### Architectural Intent
Abstract the lesson from the Database facade and the Flyweight-for-5-trade-types stories: ultra-specific micro-DSL patterns feel elegant initially but become maintenance nightmares when reality scales unexpectedly (5 trade types → 102). Generic but flexible abstractions (Repository<T, ID>, discriminated unions) scale better because they accommodate variance without breaking the base pattern.

### Requirements & Acceptance Criteria
- [ ] Micro-DSLs feel elegant at 1-5 variants
- [ ] At 50+ variants, micro-DSLs collapse under boilerplate
- [ ] Generic abstractions accommodate variance without breaking
- [ ] Design for scaling from day 1 — generic > specific
- [ ] Communicate invariants, not mechanisms

---
