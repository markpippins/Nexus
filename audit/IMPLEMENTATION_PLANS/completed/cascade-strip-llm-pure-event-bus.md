# Cascade: Strip LLM & Workflow — Become a Pure Event Bus

**Project:** nexus
**Plan Number:** 1021
**Status:** pending

## Goal

Refactor Cascade from an "event pipeline + LLM content generator + workflow engine" into a pure, single-responsibility event bus. Remove all LLM calls, all step handlers, all workflow orchestration, and all content generation from Cascade. Make Cascade responsible exclusively for **ingest → validate → sequence → persist → publish** of events via NATS. Agent roles (architect, planner, builder) become event-subscribing Tackle agents that consume events and produce artifacts independently.

## Architectural Problem

Cascade's `handlers/steps.py` contains six handlers — four of which call Ollama LLMs to generate domain vocabulary, functional requirements, TypeSpec source code, and refactoring plans. Its own README says *"The pipeline itself does not interpret events."* The 2-second poll loop in `main.py` orchestrates a workflow engine (architect_agent → dispatcher → update_tasks) that generates meaning, not just transports facts.

## Target Architecture

```
Cascade (event bus only)
┌─────────────────────────┐
│ ingest / validate        │
│ sequence / persist       │
│ publish via NATS         │
└──────┬──────────────────┘
       │ events published (nexus.cascade.v1.events.>)
       │
  ┌────┼────────┐
  ▼    ▼        ▼
Architect  Planner  Builder   ← Tackle roles with event subscriptions
  │    │        │
  ▼    ▼        ▼
vocabulary  requirements  refactoring   ← artifacts produced by agents
```

## Files Affected

- `nexus/python/cascade/main.py` — rewrite to pure event loop (no subprocess calls to architect_agent/dispatcher/update_tasks)
- `nexus/python/cascade/handlers/steps.py` — **REMOVE** (all LLM-backed handlers)
- `nexus/python/cascade/handlers/dispatcher.py` — **REMOVE** (workflow dispatch)
- `nexus/python/cascade/handlers/base.py` — **REMOVE** (step handler base class)
- `nexus/python/cascade/agents/architect_agent.py` — **REMOVE** (workflow planning)
- `nexus/python/cascade/agents/step_generator.py` — **REMOVE** (LLM prompt-to-artifact generation)
- `nexus/python/cascade/agents/llm.py` — **REMOVE** (Ollama LLM client)
- `nexus/python/cascade/prompts/templates.py` — **REMOVE** (LLM prompt templates)
- `nexus/python/cascade/projections/update_tasks.py` — **REMOVE** (task projection — moves to agent runtime)
- `nexus/python/cascade/validators/events.py` — **RETAIN** (event validation)
- `nexus/python/cascade/validators/loader.py` — **RETAIN** (event loading)
- `nexus/python/cascade/nats_publisher.py` — **CREATE** (NATS publish — Phase 1 dual-write)
- Tackle `harnesses` — add `harn-cascade-event-bus` entry
- Tackle `config_bundle` — create entries for architect, planner, spec-agent, builder, compiler, integrator roles
- Tackle `agent_scheduler` — register roles with event subscriptions

## Acceptance Criteria

- [ ] `main.py` no longer calls architect_agent, dispatcher, or update_tasks as subprocesses
- [ ] Zero imports of `call_ollama`, `step_generator`, or any prompt template in Cascade
- [ ] `handlers/steps.py`, `dispatcher.py`, `base.py` removed from cascade/ directory
- [ ] `agents/architect_agent.py`, `step_generator.py`, `llm.py` removed
- [ ] `prompts/templates.py` removed
- [ ] `projections/update_tasks.py` removed
- [ ] Event validation and loading (`validators/`) preserved and functional
- [ ] NATS publisher (`nats_publisher.py`) created with dual-write semantics
- [ ] Cascade entry registered in `tackle.harnesses` as event bus
- [ ] Agent roles registered in `tackle.config_bundle` with event subscriptions
- [ ] Agent roles registered in `tackle.agent_scheduler` with subscription-based wake
- [ ] Cascade runs without LLM dependencies (Ollama not required for Cascade itself)
- [ ] Existing event files in `events/` directory remain valid and processable

## Dependencies

- NATS server running on port 4222 (verified UP)
- `nats-py` installed in cascade Python environment
- Tackle schema accessible (harnesses, config_bundle, agent_scheduler tables exist)
- Ollama on port 11434 (required for agent roles, not for Cascade itself)

## Implementation Notes

- Cascade's runtime reduces to: read pending events → validate → persist offset → publish via NATS → sleep
- The existing `validators/loader.py` and `validators/events.py` are preserved
- `nats_publisher.py` follows the pattern from `nats_envelope/envelope.py` using CanonicalEnvelope
- All removed handlers become agent role configurations in Tackle — no source code is deleted, it becomes configuration
- The `events/` and `offsets/` directory structure is preserved for backward compatibility
- NATS subject pattern: `nexus.cascade.v1.events.>` (generalized from the previous `workflow.*` pattern)
