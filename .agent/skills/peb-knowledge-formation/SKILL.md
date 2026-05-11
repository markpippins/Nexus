# peb-knowledge-formation

## Purpose
The learning layer of the PEB. Absorbs `ADR_CANDIDATE`s and `PEB_EXTENSION_PROPOSAL`s, updating the `decision_log.md` and modifying `invariants.md` or `architecture.md` as necessary.

## Input
- Validation Layer output containing learning proposals.

## Output
- Updated PEB state.
- Emits a signal to reload the PEB context (regenerating the PEB_STATE_HASH).
