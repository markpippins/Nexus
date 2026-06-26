# Approved Plan: Implement MEEP v0.1 Bootstrap — Runnable Code Skeleton

**Status:** `Actionable`
**Source:** Harvested from `IRL IR Interaction System.html`
**Harvest Ref:** `irl-ir-interaction-system-harvested.md` #6

## Architectural Intent
A minimal working system with zero external dependencies (except dataclasses-json). Includes: heuristic IRL classifier (keyword-based), deterministic IR resolver (argmax), rule-based spec compiler, freeze lowering pass, deterministic simulator executor, append-only JSONL CER writer, and pure-function replay engine.

## Requirements & Acceptance Criteria
- [ ] CLI entrypoint: python cli/main.py "prompt"
- [ ] IRL classifier: keyword-based heuristic returning probability dict
- [ ] IR resolver: argmax over IRL probabilities
- [ ] Spec compiler: returns WorkRequestGraph with nodes
- [ ] Lowering: freezes graph with tuple deps
- [ ] Executor: deterministic loop producing NODE_START/NODE_COMPLETE events
- [ ] CER writer: append to cer.log with UTC timestamps
- [ ] Replay engine: pure reducer from events to state dict
- [ ] Proven: deterministic pipeline spine, append-only event log, replayable state, freeze boundary, IRL→IR→execution flow exists

## Files Affected
- `nexus-meep/` — entire new project (see Plan #021 for structure)

## Dependencies
- MEEP repo structure (Plan #021)

## Unresolved Follow-Ups
- Should this code live in nexus/ directly or as a separate prototype?
- When should heuristic IRL be replaced with a real probabilistic model?
