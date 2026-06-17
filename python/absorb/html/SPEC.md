# HTML Importer — Specification

## Functional Requirements

- Ingest HTML transcript sources and extract structured messages
- Normalize extracted data into typed `NormalizedMessage` records with timestamp provenance
- Support multiple source parser formats via pluggable `@register_parser` contract
- Build semantic relationship graphs from extracted messages
- Reconstruct conversation trajectories from message sequences
- Validate extracted structures through configurable validation passes
- Assemble final workspace artifacts from processed data

## Non-Functional Requirements

- Deterministic staged passes over opaque end-to-end processing
- Traceable outputs with source references (`raw_html_ref`) and confidence metadata
- Heuristic extraction fenced by validators and explicit confidence/state fields
- Graceful degradation when parsers or dependencies are unavailable

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/ingest/html | Ingest an HTML transcript file |
| POST | /api/ingest/parse | Parse a previously ingested source |
| GET | /api/ingest/messages | Retrieve extracted normalized messages |
| GET | /api/ingest/graph | Retrieve constructed relationship graph |
| POST | /api/ingest/validate | Run validation passes on extracted data |
| POST | /api/ingest/assemble | Assemble final workspace artifacts |

## Data Model

- NormalizedMessage: id (UUID), sourceRef (String), timestamp (Instant), confidence (Float), content (String), metadata (JSON), rawHtmlRef (String)
- RelationshipEdge: sourceId (UUID), targetId (UUID), type (String), weight (Float), metadata (JSON)
- Trajectory: id (UUID), name (String), messageIds (UUID[]), confidence (Float), metadata (JSON)
- ValidationResult: passName (String), status (PASS|FAIL|WARN), errors (String[]), warnings (String[])
- WorkspaceArtifact: id (UUID), type (String), name (String), content (JSON), sourceRefs (String[])
