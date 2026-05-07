# Implicit Design Philosophy

This codebase reads like a system built around **structured extraction first, interpretation second**.

## Core Philosophy

- **Normalize reality before reasoning about it**  
  The pipeline insists on producing stable, typed message records (`NormalizedMessage`, timestamp provenance, metadata) before any semantic graph work happens.

- **Deterministic staged passes over monolithic magic**  
  The graph path is explicitly broken into named phases/passes (ingest, relationships, trajectories, reconstruction, diffs, validation, evaluation, assembly). This suggests a preference for debuggable compilation-like transforms instead of opaque end-to-end inference.

- **Traceability as a first-class concern**  
  Messages retain source references (`raw_html_ref`), timestamps carry confidence/source provenance, and outputs preserve machine-readable structure. The design favors being able to explain where each datum came from.

- **Extensibility through pluggable boundaries**  
  Source ingestion uses a base parser contract + registry decorator (`@register_parser`) so new transcript sources can be added without rewriting orchestration.

- **Heuristics are acceptable, but must be fenced**  
  The system uses lightweight textual heuristics (concept extraction, trajectory seeds, interruption keywords), but wraps them in validators and explicit confidence/state fields to constrain failure modes.

- **Operational pragmatism over purity**  
  There is explicit handling for missing dependencies, partial source fidelity, fallback timestamps, unknown parsers, and mixed output modes (`messages` vs `graph`). The bias is to keep processing possible even with imperfect inputs.

## Architectural Signals

- **Data-first modeling:** heavy use of dataclasses and serializable containers indicates a model-driven architecture.  
- **Compiler mindset:** language like "pass", "invariants", "validation compiler layer", "event envelope", and "replay" suggests a semantic IR pipeline mentality.  
- **Safety rails over silent assumptions:** validation and state transition tracking are used to guard and audit inferred structure.  
- **Separation of concerns:** parser layer, graph construction, reconstruction, evaluation, and workspace synthesis are distinct modules with narrow responsibilities.

## What This Implies for Future Changes

- New capability should usually enter as a **new pass/module**, not by overloading existing ones.
- Additional parsers should conform to the **existing parser contract** and preserve normalization guarantees.
- If heuristics become smarter (ML/embedding-driven), they should still emit into the same **explicit, auditable intermediate structures**.
- Validation should expand alongside inference complexity to maintain the project’s current bias toward explainable behavior.
