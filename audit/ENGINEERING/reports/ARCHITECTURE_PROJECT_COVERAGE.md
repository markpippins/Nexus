# Architecture Project Coverage — Inspector Report

- **Generated:** 2026-06-19
- **Source of truth (claims):** `nexus/audit/ARCHITECTURE.md`
- **Source of truth (reality):** `dev/nexus/` filesystem
- **Scope:** All directories under `/home/codex/dev/nexus/`
- **Detection method:** Build-system manifest files (`package.json`, `pom.xml`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`).

---

## Summary

| Bucket | Count |
|--------|------:|
| Projects explicitly listed in `ARCHITECTURE.md` | 32 |
| Active projects discoverable on disk but **not** listed | 23 |
| Projects listed in `ARCHITECTURE.md` at paths that **don't exist** | 5 |
| Path-mismatches (listed project name exists, but at a different path) | 3 |

**Headline:** 6 MCP infrastructure projects (`nebula-mcp`, `peb-mcp`, `terrain-mcp`, plus the Python `conduit` runtime, `voyager`, and `rover`) are entirely missing from the architecture doc. The `nexus-ui/` prefix used by the React/Vite table does not exist on disk — those apps live under `angular/`. The single `python/vision/losm/` listing in the doc silently conceals **five separately-versioned losm components**.

---

## 1 — Projects on disk and NOT in `ARCHITECTURE.md`

> "Active" = has a build-system manifest (`package.json`, `pom.xml`, `pyproject.toml`, `requirements.txt`) or substantial source code.

### 1.1 TypeScript MCP servers (undocumented infrastructure)

| Project | Evidence |
|---------|----------|
| `typescript/nebula-mcp/` | `package.json` |
| `typescript/peb-mcp/` | `package.json` |
| `typescript/terrain-mcp/` | `package.json` (registers services `conduit-mcp`, `nebula-srv`, etc.) |

> **Impact:** These run as siblings of `conduit-mcp` (which IS documented). Anyone reading the doc to understand the MCP landscape would miss three servers.

### 1.2 Python workspace (undocumented modules)

| Project | Evidence |
|---------|----------|
| `python/rover/` | `requirements.txt`, `harvest_pipeline.py`, `IMPLEMENTATION_PLAN.md` |
| `python/voyager/` | `pyproject.toml`, `architecture.md` |
| `python/conduit/` | `db_adapter.py`, `executor_cloud.py`, `harness_launcher.py` (full runtime) |
| `python/agent/chat/` | python subdir with substantive chat code |
| `python/nats_envelope/` | `envelope.py` |
| `python/util/` | `cleaner.py`, `strip_timestamps.py`, etc. |
| `python/fs/fs-crawler-adapter/` | `requirements.txt` (sibling to documented `fs-crawler`) |

### 1.3 LOSM (architectural mismatch — listed as one, actually five)

`ARCHITECTURE.md` registers a single `python/vision/losm/`. Disk shows five independently-versioned Python packages:

| Project | Evidence |
|---------|----------|
| `python/vision/losm-host/` | `pyproject.toml` |
| `python/vision/losm-ir/` | `pyproject.toml` |
| `python/vision/losm-kernel/` | `pyproject.toml` |
| `python/vision/losm-shell/` | `pyproject.toml` |
| `python/vision/losm-store/` | `pyproject.toml` |

### 1.4 Java/JVM (top-level + deeper)

| Project | Evidence |
|---------|----------|
| `jvm/ballerina/demo_package/` | Ballerina source files + `README.md` |
| `jvm/spring/peb-kernel/` | multi-module Maven project (`peb-adapters`, `peb-api`, `peb-bootstrap`, `peb-core`, `peb-domain`, `peb-hash`, `peb-observability`, `peb-store`, `peb-test`) |
| `jvm/spring/terrain/` | `pom.xml`, `schema.sql`, `src/` — bridges to the TS `terrain-mcp` |

### 1.5 Go & Rust (modules mentioned as paths but no service entry)

| Project | Evidence |
|---------|----------|
| `go/wrp/ccnf-ref/` | directory with sources |
| `rust/wrp/ccnf-verifier/` | directory with sources |

> `ARCHITECTURE.md` only says "Go Services: `legacy/go/` and `go/` directories" — never lists the actual `wrp/ccnf-ref` service. Same for `rust/wrp/ccnf-verifier`.

### 1.6 Angular applications (only `nexus-console` documented)

| Project | `package.json` name |
|---------|--------------------|
| `angular/conduit-ui/` | `conduit-ui` |
| `angular/duality-ui/` | `react-example` |
| `angular/nebula-ui/` | `nebula-rms` |
| `angular/nexus-orb/` | `nexus-avatar-1` |
| `angular/prompt-architect/` | `react-example` |
| `angular/plurality-ui/` | `react-example` |

> Only `angular/nexus-console/` (`name: "nexus"`) ever appears in the doc.

---

## 2 — Documented projects at non-existent paths

Five services the doc claims to register cannot be found at the path it gives:

| Documented path | Reality |
|-----------------|---------|
| `nexus-ui/nexus-rms/` | **does not exist** on disk |
| `nexus-ui/nexus-plurality-ui/` | actual: `angular/plurality-ui/` |
| `nexus-ui/nexus-duality-ui/` | actual: `angular/duality-ui/` |
| `nexus-ui/prompt-architect/` | actual: `angular/prompt-architect/` |
| `python/ingest/html-importer/` | actual: `python/absorb/html/` |

These are *phantom entries*. They are *visible* in the doc but not in reality, and in three of four cases the real project lives at a different (inconsistent) location.

---

## 3 — Path-mismatches (cited project exists at wrong path)

| What the doc calls… | Where it actually is |
|---------------------|---------------------|
| `python/vision/losm/` | `python/vision/losm-{host,ir,kernel,shell,store}/` (5 dirs) |
| `python/ingest/html-importer/` | `python/absorb/html/` |
| `nexus-ui/<react-app>/` | `angular/<react-app>/` |

These entries are technically *present* on disk — just not where the doc says — so any CI check that resolves the documented path will silently skip the real work.

---

## 4 — Adjacent top-level directories (not services, but related)

These do not appear in `ARCHITECTURE.md` and are not "projects" in the buildable sense, but they carry system state worth noting:

| Directory | What it is |
|-----------|------------|
| `nexus/audit/` | the architecture-doc + plan artifacts home (the doc itself) |
| `nexus/typespec/v1/` | TypeSpec definitions referenced from `nexus/audit/ENGINEERING/` plans |
| `nexus/graph/` | knowledge-graph JSON + `capability/` `examples/` `schema/` `workflow/` reference graph |
| `nexus/ccnf/` | alignment contract spec |
| `nexus/ontologies/` | four ontology JSONs (chat-ux, conversation-aware-ui, ingest-ui, self-regulating-software) |
| `nexus/tools/arl/, cir1/, arl_linter.py` | CLI tooling referenced from the audit plan reports |
| `nexus/scripts/` | ~13 build/setup/migration/start scripts |
| `nexus/sample-app/` | reference text corpora (`biggestasset.txt`, `openclawgrewup.txt`) + `WORK_TO_DATE.md` |
| `nexus/tests/` | cross-project integration tests (`nebula/`, `test_executor_ollama_prompt.py`) |
| `nexus/docs/` | **empty** |
| `nexus/nexus/` | inner empty/marker directory (cosmetic) |
| `nexus/legacy/python/` | legacy Python code |
| `.conduit-data/`, `.agent/`, `.pytest_cache/`, `.idea/` | support/runtime/cache dot-dirs |

`ARCHITECTURE.md` says scopes are `jvm/**, typescript/**` — so by the doc's own rule, Python, the top-level data dirs, and the embedded `nexus-ui/` apps are *all* out of scope, which is partly why they were never registered. But that scope is itself stale.

---

## 5 — Recommendations

1. **Decide which `scope` is authoritative.** Today the doc scopes to `jvm/**, typescript/**` in advisory mode; in reality, the active system lives in `python/` (conduit, rover, voyager), and 4 MCP servers are TS. Either expand `scope.included_paths` or carve out explicit MCP/Python exceptions.
2. **Add the missing MCP trio + Python runtime cluster** to the doc — 7 entries in one section:
   - `typescript/nebula-mcp/`
   - `typescript/peb-mcp/`
   - `typescript/terrain-mcp/`
   - `python/conduit/`
   - `python/rover/`
   - `python/voyager/`
   - `python/nats_envelope/`
3. **Fix the `nexus-ui/` ↔ `angular/` mismatch.** Either move the React/Vite apps out of `angular/`, or rewrite the React/Vite table to point at `angular/<app>/`.
4. **Split the `python/vision/losm/` row** into the five actually-shipped components (`losm-host`, `losm-ir`, `losm-kernel`, `losm-shell`, `losm-store`).
5. **Rename `python/ingest/html-importer/` → `python/absorb/html/`** in the doc.
6. **Reboot the doc** from filesystem truth: scope a "Bootstrap Architecture Refresh" task — emit a fresh `ARCHITECTURE.md` from `find`-discovered manifests rather than hand-curation.
7. **Reclassification**: complete the `peb-kernel`/`terrain` Spring projects into the Backend Services table (currently silently sibling to `service-registry`).
