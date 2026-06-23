# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Nexus - Command-line argument support.html
**Model:** DeepSeek V4
**Total candidates:** 1
---
## 1. Filesystem and Image Server CLI — Portable Command-Line Flag Parsing for Node Services
**Status:** `Implemented`

### Architectural Intent
Two Node.js servers (file system server and image server) with shared CLI flag parsing: --root and --port flags override .env or defaults. Common pattern: parseFlags(defaultPort, defaultRootEnv, defaultRootFallback) returns {port, root}. Shared utility in utils/cli-flags.js enables both servers to use identical flag parsing. File server ops: ls, mkdir, newfile, deletefile, rename. Image server ops: ui (icon lookup), name, ext endpoints.

### Requirements & Acceptance Criteria
- [ ] CLI flags: --port, --root, positional root argument fallback
- [ ] Shared parseFlags utility in utils/cli-flags.js
- [ ] File server: ls, mkdir, newfile, deletefile, rename operations
- [ ] Image server: UI icon lookup, name, ext endpoints
- [ ] Portable — works in both JS and TS environments

---
