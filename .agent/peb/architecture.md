# Architecture

This document records the system structure facts and components.

## Pipeline Architecture
- The system operates as a Cognitive Runtime, transitioning from raw WorkRequests through intent normalization, PEB context binding, role-constrained reasoning, validation, reflection, and knowledge formation.
- The pipeline execution is strictly managed via `.agent/skill-pipeline.json`.
- State transitions and execution steps must be verified against this architecture document.
