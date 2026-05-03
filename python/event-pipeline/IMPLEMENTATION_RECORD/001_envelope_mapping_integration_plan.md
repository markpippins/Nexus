# 001 - EVENT PIPELINE INTEGRATION PLAN
**Target:** Event Pipeline to Nexus Kernel (External Actor Promotion)
**Date:** 2026-05-03

## 1. System Context & Integration Goal
The goal is to demote the `event-pipeline` from a sovereign "workflow controller" into an "External Actor" governed by the deterministic Nexus Kernel. 

The pipeline will emit *proposed transitions* rather than authoritative actions. Nexus evaluates legality, commits accepted transitions, and the Append-Only Event Store becomes the absolute single source of truth.

## 2. Conceptual Mapping Model
We map Pipeline JSON events into formal Nexus `IR_v2_EventEnvelope` state transitions:

- **`StepRequested` → The "Transition Proposal" Envelope**
  - **Transition:** `state: IDLE` → `state: EXECUTING_STEP`
  - **Mapping:** Establishes the `Read Set` (required contexts, inputs). No writes are performed.
- **`StepCompleted` → The "State Commitment" Envelope**
  - **Transition:** `state: EXECUTING_STEP` → `state: STEP_COMPLETE`
  - **Mapping:** Establishes the `Write Set` (newly generated artifacts). Traps the raw LLM output explicitly in the `payload` block.

## 3. Minimal Data Fields for Deterministic Replay
The `EnvelopeMapper` extracts and locks these fields to ensure cryptographic replay:
- **Stable Identity (`envelope_id`)**: A deterministic SHA-256 hash of structural fields (`pipeline_event_id + actor_id + timestamp`).
- **Execution Universe**: Session/trajectory ID bounding the workflow.
- **Explicit State Transitions**: As mapped above.
- **Read/Write Sets**: Complete and strict declarations of what data was accessed/created.
- **Provenance**: `origin_component="EventPipeline_Dispatcher"`, `origin_archetype="LLM_GENERATION"`.
- **Determinism Hashes**: `input_hash` captures the exact prompt sent to the LLM. Replays bypass LLM calls if this hash remains intact.

## 4. Proposed `EnvelopeMapper` Structure
```python
class EnvelopeMapper:
    """
    Pure translation layer: Pipeline JSON -> IR_v2_EventEnvelope
    Idempotent and deterministic. No workflow execution logic.
    """
    
    def map_step_requested(self, event_json: dict) -> IR_v2_EventEnvelope:
        # Extracts context dependencies into 'read_set'
        # Formulates Transition: IDLE -> EXECUTING
        pass

    def map_step_completed(self, event_json: dict) -> IR_v2_EventEnvelope:
        # Extracts generated artifacts into 'write_set'
        # Traps the LLM output into 'inputs.payload'
        # Formulates Transition: EXECUTING -> COMPLETE
        pass
```

## 5. Revised Lifecycle
1. **Request:** Pipeline emits `StepRequested` JSON.
2. **Translation:** `EnvelopeMapper` converts it to an envelope.
3. **Nexus Gate:** Submitted to `ExternalActorInterface.submit_event()`. Nexus evaluates constraints.
4. **Execution:** If Nexus accepts (DAG = `EXECUTING_STEP`), the pipeline fires the LLM.
5. **Completion:** LLM responds. Pipeline emits `StepCompleted` JSON.
6. **Translation:** `EnvelopeMapper` converts completion to an envelope.
7. **Commitment:** Nexus accepts and structurally locks the new artifacts into the causal DAG.

## 6. Risks & Architectural Traps
1. **Implicit Read Dependencies:** Missing context in `read_set` breaks deterministic replay.
2. **Dispatcher God-Mode:** The pipeline executing the LLM before Nexus formally accepts the `StepRequested` envelope violates Nexus governance.
3. **Semantic Hashes:** Do NOT base the `envelope_id` on the non-deterministic LLM raw text output.
4. **Missing Determinism Hashes:** Without a strict prompt `input_hash`, Nexus cannot safely shortcut the LLM during historical replays.
