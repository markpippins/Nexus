---
name: assess-stability
description: Observational analytical layer that evaluates intent node stability without assuming pipeline authority.
---

# Assess Stability Skill

## Purpose
To track and report the stability of compilation for a given intent node over time. This skill is purely observational and does NOT gate, modify, or halt the pipeline.

## Input
- Historical and current WorkRequests for a given `intent_node_id`.
- The current structured `derivation` metadata of the latest WorkRequest.

## Output
A `stability-assessment` JSON artifact.

## Schema
```json
{
  "intent_node_id": "string",
  "stability_score": "float (0.0 to 1.0)",
  "signals": {
    "semantic_delta_trend": "decreasing | increasing | stable",
    "resource_binding_stable": "boolean",
    "supersession_frequency": "low | medium | high",
    "architectural_reversals": "integer"
  },
  "recommendation": "PROMOTE_TO_CANDIDATE | HOLD_DRAFT | REVISE_INTENT"
}
```

## Rules
1. **No Authority**: This assessment does not automatically change a WorkRequest's state (e.g., it cannot actually promote a DRAFT to CANDIDATE). It only provides a recommendation.
2. **Deterministic Evaluation**: Ensure the assessment is derived from objective changes in the WorkRequest sequence, using the `supersedes` array and `derivation` metadata to compute `signals`.
