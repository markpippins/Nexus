# Command

/nebula nebula_discover_harvest_candidates

## Usage

Discover which existing systems, subsystems, or features match unlinked harvest candidates. Uses semantic search (knowledge_semantic_search) to find curated knowledge entities similar to each candidate, plus direct text matching against hierarchy names. Candidates with top curated similarity >= threshold (default 0.75) are returned as "matches" — they can be linked to existing projects. Candidates below threshold are returned as "undocumented" — they may represent new projects not yet in the hierarchy.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `candidateIds` | array<string> | No | Optional list of specific candidate UUIDs to check. If omitted, all unlinked candidates are processed (up to limit). |
| `limit` | number | No | Max unlinked candidates to process (default 50, max 200) |
| `threshold` | number | No | Confidence threshold for curated semantic matches (default 0.75). Candidates with top similarity >= threshold go to 'matches'; below go to 'undocumented'. |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_discover_harvest_candidates`
