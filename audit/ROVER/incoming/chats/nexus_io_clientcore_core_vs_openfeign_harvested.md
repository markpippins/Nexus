# Harvested Specification & Code Repository

**Source:** `chats/Nexus - io.clientcore.core vs OpenFeign.html`
**Model:** DeepSeek V4 (manual extraction)
**Batch:** 8
**Total candidates:** 1

---

## 1. io.clientcore.core vs OpenFeign — SDK Foundation vs Declarative HTTP Client
**Status:** `Observed`

### Architectural Intent
io.clientcore.core (Azure SDK's next-gen client infrastructure) is a low-level client runtime providing HTTP pipeline abstraction, request/response modeling, policies (retry/auth/logging), transport independence, and async/sync execution — used for building SDK clients. OpenFeign is a high-level declarative HTTP API client — map Java interfaces to REST calls. They solve problems at different layers: Feign = how apps call services; ClientCore = how SDKs implement services. ClientCore is closer to something Nexus would generate than something business code would use directly.

### Requirements & Acceptance Criteria
- [ ] io.clientcore.core: SDK runtime foundation — HTTP pipeline, policies, transport abstraction
- [ ] OpenFeign: declarative REST client — interface→HTTP mapping, serialization
- [ ] Stack: App Code → Feign/WebClient → Service Client SDK → ClientCore → HTTP transport
- [ ] Feign = consumer-facing; ClientCore = provider-facing
- [ ] ClientCore analogous to generated client runtime in Nexus

---
