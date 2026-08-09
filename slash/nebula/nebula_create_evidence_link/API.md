# Command

/nebula nebula_create_evidence_link

## Usage

Create an evidence link connecting a knowledge entity to harvested evidence. Validates link_type against the formal taxonomy.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `confidence` | number | No | Confidence score (0–1) |
| `knowledgeEntityId` | string | Yes | Knowledge graph entity UUID |
| `linkType` | string | Yes | Link type. Valid types: supports, refines, instantiates, contradicts, supersedes, mentions, informs, validates |
| `metadata` | string | No | Optional JSON metadata |
| `nebulaCandidateId` | string | No | Harvest candidate UUID (required if nebulaHarvestId not provided) |
| `nebulaHarvestId` | string | No | Harvest UUID (required if nebulaCandidateId not provided) |
| `provenance` | string | No | How the link was established. Valid provenance: auto_ingestor, manual, reconciler, llm_extracted, migration |
| `rationale` | string | No | Free-text explanation of why this link exists |
| `sourceSpan` | string | No | Source span coordinates (JSON object with start_offset, end_offset, chunk_index) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_create_evidence_link`
