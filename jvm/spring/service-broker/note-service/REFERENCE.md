# Note Service — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `server.port` | TBD | Service port (inherited from parent) |
| `note.content.max-length` | 100000 | Maximum character length for note content |
| `note.pagination.max-page-size` | 100 | Maximum items per page |
| `note.search.enabled` | true | Enable full-text search |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NOTE_MAX_CONTENT_LENGTH` | 100000 | Maximum note content length |
| `NOTE_PAGE_SIZE` | 25 | Default pagination page size |
| `SPRING_PROFILES_ACTIVE` | dev | Active Spring profile |
| `DB_URL` | — | PostgreSQL connection URL |

## Commands

| Command | Description |
|---------|-------------|
| `./mvnw spring-boot:run` | Start the service locally |
| `./mvnw clean package` | Build the executable JAR |
| `./mvnw test` | Run unit and integration tests |
| `curl http://localhost:{port}/api/notes` | List all notes |

## Troubleshooting

- **Note content truncated**: Increase `note.content.max-length` if the content exceeds the limit
- **Search not returning results**: Verify `note.search.enabled` is true and that the search index is built
- **Pagination off-by-one**: The page parameter is zero-indexed — page 0 is the first page
- **Sharing permissions not applying**: Ensure the user IDs in the permission records are valid UUIDs
