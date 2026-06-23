# Harvested Specification & Code Repository

**Source:** `chats/Nexus - Refactoring Domain Usage.html`
**Model:** DeepSeek V4 (manual extraction)
**Batch:** 8
**Total candidates:** 1

---

## 1. Domain Naming Strategy — Freeze, Abstract, Migrate
**Status:** `Agreed`

### Architectural Intent
Refactor strategy for domain naming when code uses a domain name (angrysurfer.com) that isn't owned. Three concerns: package/namespace names (com.angrysurfer), hardcoded URLs, and identity/schema naming. Reverse-domain naming is a convention, not a verification — fake domains work fine internally. Recommendation: freeze com.angrysurfer for now, introduce a neutral namespace (io.github.<username> or app.nexus) going forward, and only refactor when touching a module anyway. Centralize base URL and namespace in a config class so future changes are one-liner.

### Requirements & Acceptance Criteria
- [ ] Separate concerns: package names, hardcoded URLs, schema naming
- [ ] Reverse-domain is convention, not verification — fake domains valid internally
- [ ] Freeze existing namespace, introduce neutral namespace for new code
- [ ] Centralize domain/namespace in ServiceConfig
- [ ] Refactor existing code only when touching modules anyway

---
