# HTML Importer — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `ingest.parser.timeout` | 30 | Parser execution timeout (seconds) |
| `ingest.validation.enabled` | true | Enable validation passes |
| `ingest.graph.enabled` | true | Enable relationship graph construction |
| `ingest.storage.path` | ./data/ingest | Storage path for ingested data |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `INGEST_STORAGE_PATH` | ./data/ingest | Data storage path |
| `INGEST_PARSER_TIMEOUT` | 30 | Parser timeout in seconds |
| `INGEST_VALIDATION` | true | Enable validation |
| `INGEST_GRAPH` | true | Enable graph construction |
| `PYTHONPATH` | . | Python module search path |

## Commands

| Command | Description |
|---------|-------------|
| `python3 -m ingest.cli --input transcript.html --output ./output` | Run the full ingest pipeline |
| `python3 -m ingest.cli --parse --file input.html` | Parse a single file |
| `python3 -m ingest.cli --validate` | Run validation on existing data |
| `python3 -m ingest.cli --graph` | Build relationship graph |
| `pytest tests/` | Run unit and integration tests |

## Troubleshooting

- **Parser not found**: Ensure the parser module is registered with `@register_parser` and importable from the parser registry
- **Timestamp parsing errors**: Check that source timestamps follow expected format — the parser uses fallback strategies for unknown formats
- **Missing dependencies**: The HTML importer requires `docling` — run `pip install -r requirements.txt`
- **Validation warnings**: Warnings indicate heuristic uncertainty, not failures — review the validation report for context
- **Memory usage**: Large transcripts may require significant memory — try processing in smaller batches or reduce graph depth
