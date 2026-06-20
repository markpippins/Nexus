# Search Service — Specification

## Functional Requirements

- Full-text search across indexed entities (notes, users, files)
- Support faceted filtering by type, tags, date range, and owner
- Provide relevance-ranked search results with snippets
- Index updates processed asynchronously via event ingestion
- Support fuzzy search and wildcard queries

## Non-Functional Requirements

- Search query P99 latency under 200ms
- Index freshness: new documents searchable within 3 seconds
- Support 1M+ indexed documents per tenant

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/search | Execute a search query |
| POST | /api/search/index | Index or re-index a document |
| DELETE | /api/search/index/{entityType}/{entityId} | Remove a document from the index |
| GET | /api/search/facets | Get available facet values and counts |

## Data Model

- SearchRequest: query (String), filters (Facet[]), page (Integer), size (Integer)
- SearchResult: entityType (String), entityId (UUID), title (String), snippet (String), score (Float), fields (JSON)
- Facet: field (String), values (String[]), counts (Map<String, Long>)
- IndexedDocument: id (UUID), entityType, entityId, content (String), metadata (JSON), indexedAt
