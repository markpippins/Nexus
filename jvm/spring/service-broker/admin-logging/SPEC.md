# Admin Logging — Specification

## Functional Requirements

- Capture and persist application log events from all broker services
- Provide log-level filtering (DEBUG, INFO, WARN, ERROR)
- Support structured log ingestion via HTTP and AMQP
- Expose queryable log history with time-range and severity filters

## Non-Functional Requirements

- Throughput: handle 10,000+ log events per second
- Retention: 90-day log retention with automated archival
- Latency: log ingestion acknowledgment within 100ms

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/logs/ingest | Ingest a batch of log events |
| GET | /api/logs | Query logs with filters (level, from, to, service) |
| GET | /api/logs/{id} | Get a single log entry by ID |
| DELETE | /api/logs/archive | Archive logs older than retention period |

## Data Model

- LogEvent: id, timestamp, level, serviceName, message, metadata (JSON), createdAt
- LogArchive: id, archivePath, startDate, endDate, createdAt
