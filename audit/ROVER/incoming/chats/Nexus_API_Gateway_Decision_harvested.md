# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Nexus - API Gateway Decision.html
**Model:** DeepSeek V4
**Total candidates:** 3
---
## 1. Nexus as Contract-Driven Orchestrator — Pluggable Backends, Not a Secure Gateway
**Status:** `Agreed`

### Architectural Intent
Position Nexus as a contract-driven service orchestrator, not a secure API gateway. Nexus interacts with services purely through contracts (TypeSpec-defined), treating backends as pluggable and interchangeable. The UI layer should treat services as contract-driven endpoints — not assume any specific backend or auth system. Moleculer, AdonisJS+Keycloak, Spring+Zuul, Convex, Electrobun all become interchangeable implementations of the same TypeSpec contracts. This preserves experimentation freedom (Moleculer playground) while allowing enterprise-grade integration (WSO2, Eureka, Zuul) later without architectural changes.

### Requirements & Acceptance Criteria
- [ ] Nexus = contract-driven orchestrator, not API gateway
- [ ] Services = pluggable, contract-driven endpoints
- [ ] TypeSpec contracts define service capabilities, not backend implementation
- [ ] Moleculer/AdonisJS = experimentation playground
- [ ] WSO2/Eureka/Zuul = enterprise integration without architectural change
- [ ] Auth handled by service layer, not Nexus

---

## 2. Pluggable FileSystem TypeSpec Contract — Backend-Agnostic FS Interface with Multiple Implementations
**Status:** `Specified`

### Architectural Intent
Define a pluggable FileSystemService TypeSpec contract: FsItem (id, name, path, size, createdAt, updatedAt, isDirectory), FsContent (data bytes, encoding). Operations: list(path) → FsItem[], read(path) → FsContent, write(path, content) → FsItem, delete(path) → bool, optional: move, mkdir, stat, watch. Multiple backends implement the same contract: in-memory (demo/testing), local disk (via Node/Electrobun), network FS (via Spring), cloud FS (via Convex or S3). Nexus UI sees a consistent API regardless of backend.

### Requirements & Acceptance Criteria
- [ ] TypeSpec contract: FileSystemService with list/read/write/delete/move/mkdir/stat operations
- [ ] FsItem: id, name, path, size, createdAt, updatedAt, isDirectory
- [ ] FsContent: data bytes, optional encoding
- [ ] Backend implementations: in-memory, local disk, network FS, cloud FS
- [ ] Nexus/UI sees same contract regardless of backend

---

## 3. Enterprise Gateway Integration Path — Moleculer → WSO2/Eureka/Zuul Without Breaking Nexus
**Status:** `Agreed`

### Architectural Intent
Define the integration path from experimental (Moleculer+AdonisJS) to enterprise (WSO2, Eureka, Zuul) without architectural changes: Nexus stays agnostic to gateway choice by consuming services through TypeSpec contracts. As the system matures, enterprise gateways slot in at the service layer, not the Nexus layer. Key step: build a Moleculer dual-backend FS demo as the first pluggable service proof, then extend to search, auth, and user services with the same contract pattern.

### Requirements & Acceptance Criteria
- [ ] Nexus agnostic to gateway choice — contracts only
- [ ] Moleculer = experimental playground, not permanent
- [ ] Enterprise gateways (WSO2/Eureka/Zuul) slot in at service layer
- [ ] First proof: Moleculer dual-backend FS demo (in-memory + local disk)
- [ ] Pattern extends to search, auth, user services

---
