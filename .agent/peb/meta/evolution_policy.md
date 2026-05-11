# Evolution Policy

This policy defines how the PEB extends itself and prevents fossilization.

## Processes
1. **ADR Candidates**: When execution discovers a flaw in the current architecture or an intentional deviation is made, an ADR Candidate is produced. The `peb-knowledge-formation` skill promotes accepted ADR Candidates into `invariants.md` or `architecture.md`, logging it in the `decision_log.md`.
2. **PEB Extension Proposals**: When the PEB is silent on an issue, the system generates an extension proposal to explicitly expand the architecture rather than making silent assumptions.
