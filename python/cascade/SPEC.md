# Event Pipeline — Specification

## Functional Requirements

- Ingest structured events from multiple producer subsystems
- Validate events for structural integrity and temporal coherence
- Sequence events into an ordered, irreversible timeline
- Distribute events to consumers (projections, reducers, analytics)
- Support event replay for state reconstruction from scratch
- Provide source attribution for every event

## Non-Functional Requirements

- Append-only: events are never modified or deleted
- Deterministic replay: replaying events in order produces identical state
- Temporal ordering: events maintain causality via sequence ordering
- Source attribution: every event is traceable to its producer

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/events | Emit a new event to the pipeline |
| GET | /api/events | Query events with time-range and source filters |
| GET | /api/events/{id} | Get a single event by ID |
| POST | /api/events/replay | Trigger replay of historical events to rebuild state |
| GET | /api/events/sequence | Get the current sequence position |

## Data Model

- Event: id (UUID), type (String), source (String), timestamp (Instant), sequence (Long), payload (JSON), metadata (JSON)
- EventValidation: eventId (UUID), valid (Boolean), errors (String[]), warnings (String[])
- Projection: id (UUID), name (String), lastProcessedSequence (Long), state (JSON)
