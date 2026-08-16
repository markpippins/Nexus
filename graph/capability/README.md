# Capability Registry

This directory contains declared capabilities — nodes registered in the
capability graph. Each file declares one or more capabilities as
Inference, Deterministic, or External Tool nodes.

Capabilities are:

- **Single-purpose**: one node, one responsibility
- **Composable**: outputs connect to any compatible input
- **Swappable**: same schema, different implementation
- **Independently testable**: each node in isolation
- **Multi-workflow-usable**: same capability appears in multiple workflows

## Registration Format

Capabilities are registered as JSON files conforming to
`graph/schema/node-types.json`. Each file exports an array of node
definitions.

```
capability/
├── README.md
├── filesystem.json         -- Voyager capabilities (scan, observe, notify)
├── ingestion.json          -- DocLing/html-importer capabilities
└── reasoning.json          -- Inference capabilities (classify, summarize, plan)
                            -- plus deterministic plan validation (reason.validate)
```
