# Uncertainty Policy

This policy outlines the protocols for agents to safely express and resolve uncertainty.

## Deadlock Escapes
- **REQUEST_FOR_CLARIFICATION**: If an `EXECUTOR` lacks sufficient context or hits a deadlock, it is authorized to emit a `REQUEST_FOR_CLARIFICATION` rather than halting or guessing. This bridges the gap between strict execution and cognitive flexibility.
