# 📌 NEXUS IR — ISG INTEGRATION SPECIFICATION
SYSTEM / DEVELOPER PROMPT

This document defines the exact insertion point and data flow of the Interaction Semantic Gating (ISG) layer within the Transcript → EventEnvelope compilation pipeline.

## 🧠 CORE PRINCIPLE
ISG is a pre-processing annotation layer that enriches raw transcript segments BEFORE structural compilation. It MUST NOT affect event identity, causal structure, read/write set derivation, or replay semantics.

## 🔁 UPDATED PIPELINE ORDER
```text
Transcript → Segmentation Engine → ISG Layer (optional) → EventEnvelope Compiler → Event Log → ReplayEngine
```

## ⚙️ CRITICAL BOUNDARY DEFINITION
- **Segmentation → ISG:** Segmentation produces `Segment` objects containing raw text and structural markers.
- **ISG → Compiler:** ISG outputs `AnnotatedSegment` containing `isg_metadata`.
- **Bypass Mode:** If ISG is disabled, `Segment` is treated as `AnnotatedSegment` with empty metadata.

## 🔒 NON-INTERFERENCE GUARANTEE
ISG metadata MUST NOT influence:
1. **Event identity:** `event_id = hash(structural_fields_only)` (ISG explicitly excluded).
2. **Read/Write set derivation:** Only explicit references allowed.
3. **Causal structure:** Cannot create dependencies or alter DAG topology.

## 🧮 COMPILER UPDATE RULE
EventEnvelope construction separates structural truth from annotation. The ISG metadata is attached ONLY as an optional property and is explicitly forbidden from ReplayEngine, Merge Engine, or OQL evaluation logic.

## 🧭 VERSIONING RULE
Each ISG configuration MUST be versioned to ensure historical reproducibility and rule evolution traceability.

## 🚫 FORBIDDEN COUPLINGS
ISG MUST NOT be used to infer event causality, drive merge decisions, or alter graph construction. Even if ISG produces incorrect outputs, the EventEnvelope stream remains fully valid and deterministic.
