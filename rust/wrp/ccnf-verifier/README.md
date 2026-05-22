# ccnf-verifier (Rust)

Independent Rust verifier for CCNF correctness and runtime invariants.

This crate is intentionally paired with the Go reference oracle at:

- `../../../go/wrp/ccnf-ref`

The Rust verifier is used as a cross-language correctness gate and should never redefine protocol semantics independently of the frozen CCNF contract.

## Purpose

- Validate Rust CCNF pipeline output against Go golden vectors (`R8`).
- Mirror runtime boundary behavior (`R9`).
- Mirror replay behavior (`R10`).

## Run

From this directory:

```bash
cargo run --release -- ../../../go/wrp/ccnf-ref/vectors/v1
```

Equivalent invocation from the Go reference repo:

```bash
cargo run --release --manifest-path ../../../rust/wrp/ccnf-verifier/Cargo.toml -- ../../../go/wrp/ccnf-ref/vectors/v1
```

## Test

```bash
cargo test
```

Focused gate checks used by Go Make targets:

```bash
cargo test -- runtime::types runtime::trace
cargo test -- runtime::replay
```

## Contract Notes

- Golden vectors are append-only.
- Any change to frozen canonicalization semantics requires versioned contract change, not local behavior drift.
- Rust and Go must remain hash-equivalent for shared vectors.
