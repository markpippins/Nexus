# Harvested Specification & Code Repository

**Source:** `chats/Nexus - Bitemporal Data Model.html`
**Model:** DeepSeek V4 (manual extraction)
**Batch:** 7
**Total candidates:** 3

---

## 1. Bitemporal Append-Only Data Model — as_of/expired_at with Trigger-Enforced Versioning
**Status:** `Observed`

### Architectural Intent
Describe an append-only, audit-first data model taken to extreme (3000 tables, 1500 audit tables). Every change = insert new row with as_of timestamp; previous row gets expired_at set. No deletes. Triggers enforce the pattern automatically. Used in financial systems (investment bank) for regulatory compliance and full history reconstruction. This is essentially event sourcing without calling it event sourcing — implemented inside a relational database.

### Requirements & Acceptance Criteria
- [ ] No updates, no deletes — every change is an insert
- [ ] as_of/expired_at pair on every table
- [ ] Triggers enforce expiration logic automatically
- [ ] Current row = expired_at IS NULL
- [ ] Reporting queries filter by effective date range
- [ ] Database as source of truth AND execution engine for business logic

---

## 2. Legacy-to-Modern Architecture Mapping — Event Sourcing, CQRS, Temporal DBs
**Status:** `Observed`

### Architectural Intent
Map the legacy bitemporal pattern to modern architectural equivalents: Event Sourcing (cleanest philosophical descendant — explicit events instead of implicit versioned rows), CQRS (separate write/read sides mirroring the original's insert-plus-report pattern), Temporal/Bitemporal databases (direct evolution with built-in AS OF querying), Microservices with smart endpoints (business logic moves out of DB into services). The pattern 'is event sourcing without calling it event sourcing.'

### Requirements & Acceptance Criteria
- [ ] Event Sourcing: explicit events (TradeAmended, PositionAdjusted) as source of truth
- [ ] CQRS: append-only writes, time-aware denormalized reads
- [ ] Temporal DBs: SQL Server System-Versioned Tables, Oracle Flashback
- [ ] Services define lifecycle and versioning rules instead of DB triggers
- [ ] Make implicit behavior explicit — move expired_from triggers into services

---

## 3. Pattern Transfer Across Architectural Layers — Transliteration vs Mapping
**Status:** `Observed`

### Architectural Intent
Demonstrate the architectural lesson that patterns don't transfer cleanly across layers. An EJB developer was given the bitemporal/append-only audit pattern description and attempted to recreate it at the EJB application layer instead of the database layer. The result worked but was painful — reimplementing database guarantees (versioning, expiration semantics, audit consistency) in application code where the framework wasn't designed for it. Key lesson: communicate invariants and guarantees, not mechanisms.

### Requirements & Acceptance Criteria
- [ ] Patterns must be mapped to the layer that naturally enforces them
- [ ] Communicate invariants ('no data is ever lost, every state change is reconstructable'), not mechanisms ('insert new rows and expire old ones')
- [ ] Application-level implementation of DB-native patterns is possible but painful
- [ ] Design invariants, not implementations

---
