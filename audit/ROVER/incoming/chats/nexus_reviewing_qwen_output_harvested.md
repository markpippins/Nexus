# Harvested Specification & Code Repository

**Source:** `chats/Nexus - Reviewing Qwen Output.html`
**Model:** DeepSeek V4 (manual extraction)
**Batch:** 7
**Total candidates:** 3

---

## 1. TypeSpec for Service Broker — API/SPI/Service Separation with IBroker Contract
**Status:** `Implemented`

### Architectural Intent
Define TypeSpec contracts for the service broker with three-layer separation: api (external contract — /api/v1/submitRequest), spi (internal extension point — BrokerHandler interface), service (orchestration/core broker logic). Focused on submitRequest/ServiceRequest/ServiceResponse/IBroker contracts only, excluding service discovery and registry. Qwen generated scaffolding from Spring canonical implementation. Key refinements: remove extends IBroker (Java artifact), replace ServiceResponse<unknown> with typed ServiceResponseBody union, convert BrokerOperation/BrokerParam from scalars to structured models.

### Requirements & Acceptance Criteria
- [ ] Three layers: api (external), spi (extension), service (orchestration)
- [ ] Core models: IBroker, ServiceRequest, ServiceResponse, BrokerOperation, BrokerParam
- [ ] Endpoint: /api/v1/submitRequest
- [ ] No service discovery or registry in scope
- [ ] Spring = canonical implementation for codegen
- [ ] Quarkus adapter layer can be added later
- [ ] Generic core + platform-specific layers pattern

---

## 2. Legacy Versioning Strategy — V0 Frozen Reference, V1 TypeSpec-Aligned Playground
**Status:** `Implemented`

### Architectural Intent
Implement a versioning strategy that treats legacy V0 code as a frozen reference implementation (not ongoing spec). BrokerControllerV0.java marked deprecated with original /api/broker path preserved. BrokerController.java uses /api/v1/broker with TypeSpec-aligned models and converts between V1 and legacy types via ServiceResponseBody.fromLegacy()/toLegacy(). The V0 code serves as a behavior reference for generated V1 code — 'hey we left that out' detection. V1 is the playground for new generated code; V0 preserves existing client compatibility.

### Requirements & Acceptance Criteria
- [ ] V0: frozen reference implementation, deprecated
- [ ] V1: TypeSpec-aligned, new /v1/broker path
- [ ] ServiceResponseBody: fromLegacy()/toLegacy() bridge methods
- [ ] V0 as behavior reference — check for missing V1 features
- [ ] No V0 changes — preserves existing client compatibility
- [ ] Test harness validates V1 against V0 behavior

---

## 3. Generic Core + Platform-Specific TypeSpec Layers
**Status:** `Proposed`

### Architectural Intent
Define a two-layer TypeSpec structure: Generic/Canonical Layer (pure broker contract — operations, models, unions — no framework assumptions) and Platform-Specific Layer (Spring/Quarkus/etc. — references generic layer, adds routing/REST annotations, serialization tweaks, DI hooks). Core never changes; platform layers are thin adapters. Enables safe regeneration, avoids duplication/drift, and future-proofs for MCP or other platforms.

### Requirements & Acceptance Criteria
- [ ] Generic core: pure contracts, no framework assumptions
- [ ] Platform layer: Spring/Quarkus-specific annotations and mapping
- [ ] Core never changes — source of truth
- [ ] Platform layers are thin adapters
- [ ] Safe regeneration: platform layers can be regenerated independently
- [ ] Future-proof: new platforms add a folder, not refactor core

---
