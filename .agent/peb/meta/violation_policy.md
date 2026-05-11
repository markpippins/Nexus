# Violation Policy

This policy defines the bounds of structural integrity for outputs.

## Detection Rules
- The Validation Layer detects any structural violations, such as Authority Leakage (e.g., EXECUTOR emitting a WorkRequest), missing Two-Layer normalization, or contradictions to hard invariants.
- **CRITICAL CHANGE**: The Validation Layer DOES NOT HALT. It routes detected violations to the `peb-exception-router` for contextual evaluation.
