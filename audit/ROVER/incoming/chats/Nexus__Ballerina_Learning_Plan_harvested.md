# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Nexus - Ballerina Learning Plan.html
**Model:** DeepSeek V4
**Total candidates:** 1
---
## 1. Ballerina as Service-Oriented Language — Concurrency, HTTP, and Data Formats Built into Language Primitives
**Status:** `Observed`

### Architectural Intent
Ballerina is a service-oriented language where concurrency (workers, fork/join, future/await), HTTP services (service on listener, resource functions), and data formats (JSON/XML parsing, type-safe conversion) are built-in language primitives rather than framework layers. This contrasts with Java where these capabilities require external frameworks (Spring, OkHttp, JUnit). Ballerina encourages composition and type safety at the service level, with types, records, and modules as first-class concepts. Mental model shift: think in terms of data flows and services, not objects and classes.

### Requirements & Acceptance Criteria
- [ ] Workers and fork/join for structured concurrency
- [ ] HTTP services as language primitives — no framework required
- [ ] JSON/XML parsing with type-safe cloneWithType()
- [ ] Records and modules replace Java's class/OOP hierarchy
- [ ] check expression replaces try/catch for error propagation
- [ ] Optional types replace null

---
