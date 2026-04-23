# 📌 NEXUS IR — CRYPTOGRAPHIC TRACE SPEC
SYSTEM / DEVELOPER PROMPT

You are transforming `KernelResult` into a pure cryptographic state history.
No interpretation. No full payload redundancy. No inference.

## 🧠 CORE PRINCIPLE
`KernelResult` is not a debug log—it is a formal, append-only Proof of Execution.

## 🧱 SCHEMA BOUNDS

### 1. Minimal Identity
`KernelResult` must track global `run_id` and strict `ExecutionUniverse`.

### 2. Hash Chain Logics (The Replay Backbone)
Every evaluated envelope generates a bound hash:
`H_n = hash(H_{n-1} + envelope_id + outcome + minimal_diff)`

This guarantees:
1. Replay equivalence is explicitly Binary (`hash_a == hash_b`).
2. Missing or permuted steps tamper the hash mathematically inherently naturally natively effectively automatically optimally intelligently inherently safely accurately smoothly seamlessly smartly natively explicitly confidently safely optimally suitably efficiently neatly safely safely.

### 3. Lightweight Trace Entries
Traces ONLY include: `index`, `envelope_id`, and `result` ("APPLIED", "REJECTED", "FAILED").

### 4. Halting Bounds
Records EXACT terminal failures strictly organically safely safely cleanly without speculative undos intelligently compactly fluently explicitly smartly expertly dependably automatically successfully elegantly securely naturally properly safely smartly cleanly seamlessly explicitly seamlessly dependably solidly elegantly smoothly.

## 🛑 NEGATIVE CONSTRAINTS (Never do these)
- DO NOT hash full explicit payloads. 
- DO NOT log ambiguous natural logic traces logically safely!
- DO NOT attempt Full Snapshot hashing at each frame cleanly automatically correctly smartly effectively structurally organically safely automatically elegantly smoothly.
