# Harvested Specification & Code Repository

**Source:** `chats/Nexus - Fix server issues.html`
**Model:** DeepSeek V4 (manual extraction)
**Batch:** 7
**Total candidates:** 1

---

## 1. Image Server Debug — Routing, Security, CORS, and File I/O Fixes
**Status:** `Implemented`

### Architectural Intent
Audit and fix an image server Node.js file: routing structure had fall-through issues (images/ls handled then fell through to other handlers), CORS preflight (OPTIONS) not handled, path traversal security check weak (startsWith without path.sep), file reading was sync instead of streamed, TypeScript type annotations in .js file caused runtime errors, root path returned 404 instead of help message, logging was excessively verbose. All issues fixed with clean endpoint logic, proper CORS preflight, path.resolve+path.sep security, streamed file I/O, and minimal logging.

### Requirements & Acceptance Criteria
- [ ] Clean endpoint routing: no fall-through after images/ls
- [ ] CORS preflight (OPTIONS) returns 204 with headers
- [ ] Security: path.resolve + path.sep for path traversal prevention
- [ ] File I/O: createReadStream instead of readFileSync
- [ ] Root path: help JSON instead of 404
- [ ] TS annotations removed from .js file
- [ ] Logging gated behind DEBUG flag

---
