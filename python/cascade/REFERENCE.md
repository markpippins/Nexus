# Event Pipeline — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `pipeline.storage.path` | ./data/events | Event storage path |
| `pipeline.validation.enabled` | true | Enable event validation |
| `pipeline.sequence.batch-size` | 1000 | Events per batch for replay |
| `pipeline.projection.interval-ms` | 5000 | Projection refresh interval |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PIPELINE_STORAGE_PATH` | ./data/events | Event storage directory |
| `PIPELINE_SEQUENCE_BATCH_SIZE` | 1000 | Replay batch size |
| `PYTHONPATH` | . | Python module search path |

## Commands

| Command | Description |
|---------|-------------|
| `python3 -m pipeline emit --type knowledge.discovered --payload '...'` | Emit an event |
| `python3 -m pipeline replay --from 0 --to latest` | Replay events for state reconstruction |
| `python3 -m pipeline status` | Show sequence position and health |
| `python3 -m pipeline validate` | Run validation on all unprocessed events |
| `pytest tests/` | Run unit and integration tests |

## Troubleshooting

- **Event rejected**: Check validation errors — the event may be structurally invalid or temporally incoherent
- **Replay out of order**: Events are replayed in sequence order — ensure no gaps in the sequence by checking for missing IDs
- **High replay latency**: Increase batch-size for faster replay of large event streams
- **Projection stale**: The projection may not have kept up with the latest sequence — check the projection's lastProcessedSequence
