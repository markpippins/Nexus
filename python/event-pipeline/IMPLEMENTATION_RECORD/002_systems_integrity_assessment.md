# 002 - SYSTEMS INTEGRITY ASSESSMENT (PIPELINE INTEGRATION)
**Target:** Event Pipeline -> Nexus Kernel Boundaries
**Role:** Nexus Systems Reviewer
**Date:** 2026-05-03

## 1. Current Architectural Alignment Level
- **Conceptual Alignment:** High. The design to demote the pipeline to an "External Actor" mapping JSON to `IR_v2_EventEnvelope` aligns perfectly with the Event Sovereignty and Kernel Authority invariants.
- **Physical Alignment:** At Risk. Based on the API surface of the `event-pipeline` (specifically `read_offset()` and `write_offset()` inside `architect_agent.py`), the pipeline currently maintains a shadow state machine. If this local tracking is not abolished, the integration will result in a split-brain architecture where Nexus and the Pipeline disagree on reality.

## 2. Missing Integration Invariants
- **The Epistemic State Invariant:** The Pipeline must have zero memory. It cannot know what step to run next by checking a local `offset` file or internal memory map. It must derive its next action by querying the Nexus Kernel (via an OQL projection of the Spacetime frontier). 
- **The Rejection Loop Invariant:** The integration plan lacks a formal protocol for Nexus rejecting a `StepRequested` envelope. If the Kernel enforces the rules and says "No," the Pipeline must fail cleanly or query the Kernel for missing dependencies, rather than entering a blind retry loop.

## 3. Highest-Risk Upcoming Decisions
- **LLM Context Assembly (The `read_set` trap):** When the Pipeline builds the prompt for the LLM, if it reads context from local files or its own memory rather than explicitly extracting it from the exact artifact IDs bound in the `read_set` by the Nexus Kernel, cryptographic replay is destroyed. The LLM must be fed strictly from the Nexus projection.
- **Infrastructure Abstraction Leakage:** The pipeline contains methods like `check_ollama()` and `warmup_model()`. We must strictly ensure that physical infrastructure availability (hardware states) never bleeds into the causal `IR_v2_EventEnvelope`. Hardware failures are runtime layer concerns, not causal graph mutations.

## 4. Recommended Next Stabilization Milestone
**Abolish Local Offsets and Enforce OQL State Routing:**
Before writing the `EnvelopeMapper`, we must architect the deprecation of the Pipeline's internal offset tracking. The Pipeline's dispatcher must be refactored into a stateless loop that wakes up, queries Nexus (`OQL.GetTerminalFrontier()`), receives the authorized next transitions, requests permission (`StepRequested`), executes the LLM, and commits (`StepCompleted`). 

**Decision Conclusion:** 
The pipeline cannot be an "automation engine" anymore. It must become a "stateless worker" entirely subjugated to the Nexus topological sort.
