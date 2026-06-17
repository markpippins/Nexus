# PEB Kernel Architecture

The Persistent Engineering Brain (PEB) Kernel is designed to enforce deterministic governance, immutable state tracking, and Merkle-tree backed auditing across the Nexus system. This document serves as the architectural reference for engineers working on the `peb-kernel` Spring Boot application.

## 1. Core Principles

- **Immutable State:** Codebase state and intent are captured as structured, immutable `PebState` records.
- **Event-Sourced Decisions:** Every change to the system is recorded as a `PebDecision` linked cryptographically to the previous decision.
- **Transaction Safety:** All system modifications occur via a `PebTransaction` that captures inputs, outputs, and state deltas.
- **Strict Layer Separation:** The Maven multi-module structure prevents domain leakage into API or infrastructure layers.

## 2. Module Dependency Graph

The project enforces strict, unidirectional dependency rules:

```
peb-domain     ← peb-store ← peb-core ← peb-api
                                    ↕          ↕
                              peb-hash    peb-adapters
                                               ↓
                                          peb-observability
                                               ↓
                                          peb-bootstrap
```

- **`peb-domain`**: Pure Java. No Spring dependencies. Contains the core entities and value objects.
- **`peb-store`**: Infrastructure layer for PostgreSQL. Spring Data JPA + Flyway.
- **`peb-core`**: The governance engine. Orchestrates transactions and validates invariants.
- **`peb-bootstrap`**: The application context root. Wires all components together.

## 3. Data Integrity & The Merkle Chain

Data integrity is the central pillar of the PEB Kernel. 

### State Hashing
Every `PebState` entity has a `checksum` calculated as the SHA-256 hash of its structured JSON content.
```java
public record PebStateHash(String value) { ... }
```

### The Decision Chain (Merkle Tree)
When a `PebTransaction` alters the system state, a `PebDecision` is generated. 
- The `PebDecision` records the `beforeHash` and `afterHash` of the system state.
- It contains a `parentDecisionId`, creating a cryptographically linked DAG of system history.
- The `PebHashService` in the `peb-hash` module is responsible for computing and validating these chains.

## 4. Execution Flow

When an external actor (like the `conduit-mcp` server) submits a WorkRequest or state change:

1. **Ingress:** The request arrives at the `AdmissionControllerFacade` in the `peb-api` module.
2. **Governance:** The facade delegates to the `PebGovernanceEngine` (`peb-core`).
3. **Validation:** The `InvariantValidator` asserts that the requested change does not violate system invariants or capability tokens.
4. **Transaction Processing:** The `PebTransactionEngine` opens a JPA `@Transactional` context.
5. **Execution & Hashing:** The engine applies the state changes, calls `PebHashService` to compute the new Merkle checksums, and saves the resulting `PebTransaction` and `PebDecision`.
6. **Commit:** The transaction is committed to the PostgreSQL database via `peb-store`.

## 5. Security and Capability Tokens

Actions within the kernel are gated by the `PebCapability` entity. 
Tokens follow the format: `cap:<action>[:scope=<resource_type>:<filter>]`
*Example: `cap:mutate_state:key=invariants`*

The `PebViolation` entity acts as an audit trail for any capability breaches, Authority Leakage, or unauthorized semantic normalization attempts.
