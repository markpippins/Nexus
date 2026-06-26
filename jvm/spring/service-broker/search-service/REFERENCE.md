# Search Service — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `server.port` | TBD | Service port (inherited from parent) |
| `search.index.batch-size` | 100 | Documents indexed per batch |
| `search.index.refresh-interval-ms` | 3000 | Index refresh interval for near-real-time search |
| `search.query.max-results` | 1000 | Maximum results per search query |
| `search.query.default-page-size` | 25 | Default results per page |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SEARCH_INDEX_PATH` | ./data/index | Path for the search index |
| `SEARCH_REFRESH_INTERVAL_MS` | 3000 | Index refresh interval |
| `SPRING_PROFILES_ACTIVE` | dev | Active Spring profile |

## Commands

| Command | Description |
|---------|-------------|
| `./mvnw spring-boot:run` | Start the service locally |
| `./mvnw clean package` | Build the executable JAR |
| `./mvnw test` | Run unit and integration tests |
| `curl -X POST -d '{"query":"test"}' http://localhost:{port}/api/search` | Execute a test search |

## Troubleshooting

- **Search returns stale results**: Decrease `search.index.refresh-interval-ms` for faster index freshness (trade-off with write throughput)
- **No results found**: Check that documents have been indexed via `POST /api/search/index` and that the query is correctly formed
- **High memory usage**: Reduce `search.index.batch-size` or increase JVM heap
- **Index corruption**: Delete the index path (`SEARCH_INDEX_PATH`) and re-index all documents
