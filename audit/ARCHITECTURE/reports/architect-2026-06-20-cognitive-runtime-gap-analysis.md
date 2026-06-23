---
role: architect
date: 2026-06-20
summary: Gap analysis for distributed cognitive runtime — AI techniques taxonomy, previous-gen NLP placement, missing tooling inventory
session: deep-dive
---

# Cognitive Runtime Gap Analysis

## System Inventory (as of June 20, 2026)

### Running
| Component | Status | Detail |
|-----------|--------|--------|
| NATS Server | Live | JetStream enabled, port 4222, monitoring 8222. Subjects: `nexus.fs.v1.>` (voyager), `nexus.cascade.v1.workflow.>` (cascade dual-write Phase 1) |
| Temporal | Live | Native server PID 68048, port 7233, web UI 8233. Conduit worker active |
| Conduit MCP | Live | Port 3100, SSE. SQLite DB with plan lifecycle, receipts, tickets, agents |
| Rover MCP | Live | Port 3102, SSE. Harvest transcript pipeline |
| Cascade | Live | 2s poll loop: architect_agent → dispatcher → projections. Event files + NATS dual-write |
| Service Mesh | Live | Spring API gateway discovered, Angular UI with full mesh model (15 framework categories, deployments, health checks) |
| MEEP Phase 1 | Live | Plans 0136–0142 closed REVIEW_PASS. 186 tests. Station 0 (AST parser + features), IRL classifier |
| Harvest Corpus | Live | 47 harvest files in ROVER/processed/harvests/ (42 DeepSeek V4, 5 qwen2.5:0.5b holdovers) |
| Work Requests | Live | 60 files in `.conduit-data/WORK_REQUESTS/`, DCO schema with full lifecycle |
| MCP Harnesses | Live | conduit-mcp + rover-mcp registered in opencode.json |
| Phase 2 Plans | Pending | Plans 0143 (DAG support) → 0144 (execution kernel) → 0145 (observation) → 0146 (distribution). Dependency-chained |

### Planned/Incomplete
| Component | Status | Detail |
|-----------|--------|--------|
| Vector Project | Not started | Time-snapshot embeddings for reasoning about state change |
| OLAP Fact Database | Not started | Immutable fact store for real-world data (weather, stocks, calendar) |
| Cross-reference automation | Partial | CROSS_REFERENCES.md exists, seeded, not auto-updating |
| Cascade full NATS migration | Phase 1/4 | Phase 1 (dual-write) live. Phases 2-4 (subscription, JetStream, distributed workers) not started |
| TLA+/CUE formalization | Planned | Must precede distribution station (Phase 2 dependency chain) |

---

## AI Techniques Taxonomy for This Architecture

### Layer 1: Deterministic Structural Techniques (μs, zero tokens)
Already in use. Expand consciously.

| Technique | Current use | Expansion opportunity |
|-----------|-------------|----------------------|
| AST / line-oriented parsing | MEEP Station 0 (markdown → AST → features) | Post-harvest structural QA gate. Validate code blocks not truncated, headings conform to schema |
| Regex / pattern matching | IRL classifier keyword matching | Pre-LLM gating: "does this input need LLM or can rules handle it?" |
| Sentence splitting / tokenization | Chunking in Rover + MEEP | Extract to shared utility module — currently duplicated |
| N-gram overlap analysis | Not used | Post-harvest: detect concept overlap between harvests (shared n-grams in intent descriptions → related topics) |
| Named entity recognition (regex) | Not used | Pre-harvest: tag known entities (plan numbers, file paths, model names) in raw text for immediate linking |

### Layer 2: LLM-Based Extraction (seconds–minutes, token cost)
Sweet spot: unstructured → structured transformation with fixed schema.

| Technique | Current use | Expansion opportunity |
|-----------|-------------|----------------------|
| Structured extraction via schema | Rover pipeline: SpecAgenda JSON from transcripts | Same pattern for any "conversation → code" use case. The SpecAgenda IS the contract |
| Classification with AST features | MEEP IRL classifier | Same pattern for any document type classification |
| Summarization / condensation | Not used | Harvest-to-digest for the cross-reference graph |

### Layer 3: Embedding / Semantic Techniques (not yet built)
Highest impact per effort: bridges all data stores.

| Technique | Where it would live | Why |
|-----------|-------------------|-----|
| Embedding similarity search | Vector project | Harvests → embed → similarity. Cross-reference auto-suggestion. Plan de-duplication |
| Change point detection | Vector snapshots over time | Detect theme emergence/decline across harvest corpus |
| Semantic clustering | Embedding store | Group related harvests into topics. Community detection on knowledge graph |

### Layer 4: Graph Algorithms (not yet built)
Leverages existing structure (plans, cross-refs, service dependencies).

| Technique | Where it would live | Why |
|-----------|-------------------|-----|
| Centrality / PageRank | Knowledge graph + plan graph | "Which plans are most coupled to everything else?" |
| Reachability / cut analysis | Dependency graphs | "If I remove this subsystem, what breaks?" |
| Community detection | Cross-reference graph | "Which harvests form a community around governance?" |

### Layer 5: Time Series / Forecasting (not yet built)
Depends on OLAP fact database.

| Technique | Where it would live | Why |
|-----------|-------------------|-----|
| Trend detection | OLAP fact DB | Harvest growth rate, model throughput trends |
| Correlation analysis | OLAP fact DB + system metrics | "Does weather correlate with system behavior?" |
| Anomaly detection | Service mesh health metrics | Unusual failure rates, latency spikes |

### Layer 6: Reinforcement Learning from Feedback (distant future)
| Technique | Where it would live | Why it's early |
|-----------|-------------------|----------------|
| RLHF / preference optimization | QA audit pipeline | Need ~500+ human QA decisions before enough signal exists |

---

## Missing Tooling: 7 Gaps for a Distributed Cognitive Runtime

### Gap 1: Schema Registry
**Problem:** Schema is scattered — Pydantic models, TypeScript interfaces, JSON schemas, SQLite tables. No single source of truth.
**Minimal fix:** `schemas/` directory with canonical JSON Schema + `schema_registry.py` validator. Conduit-mcp could serve via `GET /schema/{name}`.

### Gap 2: Model Router / Capability Registry
**Problem:** Model selection is hardcoded. No capability-based routing.
**Minimal fix:** `model_registry.json` mapping model → capabilities/cost/latency/tags + `select_model(required_capabilities)` function.

### Gap 3: Circuit Breaker + Rate Limiter for LLM Calls
**Problem:** No coordinated backpressure. Failing models could trigger retry storms across MCP harnesses.
**Minimal fix:** `harness_circuit_breaker` wrapper tracking consecutive failures per endpoint with probe recovery. Leverage conduit-mcp's existing circuit breaker concept.

### Gap 4: Distributed Tracing (OpenTelemetry)
**Problem:** Causal chain from transcript → harvest → plan → code change is invisible.
**Minimal fix:** OTEL Python auto-instrumentation. Propagate trace context through NATS headers. Every MCP endpoint gets automatic spans.

### Gap 5: OLAP Fact Database
**Problem:** No ground truth store for real-world facts that the system consults but doesn't generate.
**Minimal fix:** SQLite with immutable append-only `facts` table: namespace, fact_type, subject, value, recorded_at, source, confidence, expires_at.

### Gap 6: Policy / Rule Engine
**Problem:** Governance rules are implicit in agent roles and human judgement.
**Minimal fix:** `rules/` directory with Rego policies or Python decision-tree DSL. Evaluate at control points: model selection, promotion, deployment.

### Gap 7: Cognitive Task Scheduler
**Problem:** No single scheduler for WorkRequests, cascade pipeline, and agent roles. Resource contention and priority inversions.
**Minimal fix:** `cognitive_scheduler` service on NATS `nexus.scheduler.v1.request.*`. Priority queue with deadline, resource requirements, dependency tracking.

---

## Highest-Leverage Next Step

**Build the embedding/vector retrieval loop** — it bridges every gap:
- Harvest embeddings → semantic cross-link suggestion (replaces manual CROSS_REFERENCES.md)
- Plan description embeddings → duplicate detection
- Vector snapshots over time → change point detection for theme emergence
- Same embedding model can power semantic search + similarity + anomaly detection
- Data already exists (47 harvests, 60 work requests, growing plan corpus)
- Compute already exists (DeepSeek V4 can produce embeddings)
- Schema already exists (SpecAgenda, WorkRequestDCO — both have structured text)
