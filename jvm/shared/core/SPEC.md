# Shared Core — Specification

## Functional Requirements

- Define language-agnostic canonical core models for the Nexus platform
- Provide a single source of truth for core data structures (BinaryData, ResponseError, PagedResponse)
- Support framework-specific adapters for Spring, Helidon, and Quarkus
- Enable incremental migration from legacy com.angrysurfer.* packages to com.aibizarchitect.*
- Keep core models free of framework-specific types

## Non-Functional Requirements

- Zero framework dependencies in core module
- Pure POJOs for maximum portability
- Backward-compatible evolution for migration period
- Adapter modules provide framework-specific mapping

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| (Library) | Core models | BinaryData, ResponseError, PagedResponse |
| (Library) | Adapters | Spring, Helidon, Quarkus → canonical mapping |

## Data Model

- BinaryData: id (UUID), mimeType (String), content (byte[]), checksum (String), metadata (JSON)
- ResponseError: code (String), message (String), field (String), details (JSON)
- PagedResponse: items (T[]), total (Long), page (Integer), size (Integer), totalPages (Integer)
