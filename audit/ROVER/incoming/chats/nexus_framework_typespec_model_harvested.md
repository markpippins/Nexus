# Harvested Specification & Code Repository

**Source:** `chats/Nexus - Framework TypeSpec Model.html`
**Model:** DeepSeek V4 (manual extraction)
**Batch:** 7
**Total candidates:** 2

---

## 1. Framework Ecosystem TypeSpec Model — Canonical CRUD for Framework, Category, Language, Vendor
**Status:** `Implemented`

### Architectural Intent
Model the framework ecosystem as TypeSpec types: Framework (name, description, vendor, category, language, versions, URL, flags), FrameworkCategory (name), FrameworkLanguage (name, description, versions), FrameworkVendor (name, description, URL). TypeSpec becomes the canonical system contract — not Spring annotations. Layered approach: TypeSpec→OpenAPI→Spring Controller→Repository→UI. Vendor CRUD is the first integration with the /v1 API.

### Requirements & Acceptance Criteria
- [ ] TypeSpec models: Framework, FrameworkCategory, FrameworkLanguage, FrameworkVendor
- [ ] TypeSpec→OpenAPI→Spring Controller→Repository→UI pipeline
- [ ] Vendor as bootstrap entity: independent, referenceable, low complexity
- [ ] No service layer — pure CRUD via Controller→Repository
- [ ] /v1/vendors CRUD endpoint as first integration

---

## 2. TypeSpec as Domain Language, Not Just Schema — Framework API as Typed Catalog
**Status:** `Agreed`

### Architectural Intent
Position TypeSpec as the domain language for the framework catalog, not just a schema definition. The framework catalog is more than CRUD — it's a typed catalog of software ecosystems enabling AI reasoning over stacks, recommendation engines, compatibility graphs, and architecture exploration. TypeSpec models become the canonical system model from which all implementations derive.

### Requirements & Acceptance Criteria
- [ ] TypeSpec = domain language, not just schema
- [ ] Framework catalog = typed ecosystem, not just CRUD forms
- [ ] Enables: AI stack reasoning, recommendations, compatibility graphs
- [ ] All implementations derive from TypeSpec models
- [ ] No service layer — Controller→Repository only

---
