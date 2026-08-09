# Command

/nebula nebula_list_evidence_links

## Usage

List evidence links between knowledge entities and harvested evidence, with optional filters.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `knowledgeEntityId` | string | No | Filter by knowledge graph entity UUID |
| `limit` | number | No | Max results, default 100 |
| `linkType` | string | No | Filter by link type. Valid types: supports, refines, instantiates, contradicts, supersedes, mentions, informs, validates |
| `maxConfidence` | number | No | Maximum confidence filter (0–1) |
| `minConfidence` | number | No | Minimum confidence filter (0–1) |
| `nebulaCandidateId` | string | No | Filter by harvest candidate UUID |
| `nebulaHarvestId` | string | No | Filter by harvest UUID |
| `offset` | number | No | Pagination offset |
| `provenance` | string | No | Filter by provenance. Valid provenance: auto_ingestor, manual, reconciler, llm_extracted, migration |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_list_evidence_links`
