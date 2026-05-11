# Invariants

This document defines the hard laws and non-negotiable rules of the system.

## Hard Laws
1. **No Authority Leakage**: EXECUTORS may not emit WorkRequests. CRITICS may not execute steps or assign tasks.
2. **State Dependency**: System decisions must be grounded in the existing PEB state. Any derivation from silent parts of the PEB without explicit extension is a violation.
3. **Semantic Normalization**: All cognitive pipeline steps must produce parseable, structurally verifiable JSON metadata detailing context used, decisions, and next steps.
