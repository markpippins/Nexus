# PEB Kernel (Persistent Engineering Brain)

The PEB Kernel is a Spring Boot application acting as the governance, state management, and orchestration backend for the Nexus ecosystem. It implements a deterministic, event-sourced requirements capture system utilizing a Merkle-tree backed state ledger.

## Architecture

This project is built as a Maven multi-module architecture to strictly enforce domain-driven boundaries and separation of concerns.

### Modules

- **`peb-domain`**: Core entities (`PebState`, `PebDecision`, `PebTransaction`, `PebTrace`, `PebViolation`, `PebCapability`), value objects (`PebStateHash`), and Enums.
- **`peb-store`**: Data persistence layer using Spring Data JPA and Flyway SQL migrations (`V1__init_peb_schema.sql`) backed by PostgreSQL.
- **`peb-core`**: Core business logic containing the `PebGovernanceEngine`, `PebTransactionEngine`, and `InvariantValidator`.
- **`peb-hash`**: Contains the `PebHashService` responsible for generating and validating Merkle chain checksums.
- **`peb-api`**: Exposes the REST facades (e.g., `AdmissionControllerFacade`) for external invocation (specifically from `conduit-mcp`).
- **`peb-adapters`**: Houses adapters bridging the JVM domain to other ecosystems (e.g., `ConduitMcpAdapter`, `LosmIrTransitionAdapter`).
- **`peb-bootstrap`**: The application launcher (`@SpringBootApplication`) containing the central `application.yml` and context configurations.
- **`peb-observability` / `peb-test`**: Telemetry and test boundaries (implementation ongoing).

## Getting Started

### Prerequisites
- Java 21+
- PostgreSQL
- Maven 3.9+

### Building

To build the entire kernel and its submodules, run from the root of this directory:

```bash
mvn clean install
```

### Running

To run the application locally, ensure your PostgreSQL database matches the `application.yml` credentials, then execute the `peb-bootstrap` module:

```bash
cd peb-bootstrap
mvn spring-boot:run
```
