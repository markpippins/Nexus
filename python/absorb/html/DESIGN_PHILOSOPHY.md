
# HTML Importer — Conceptual Ingestion Layer

## Purpose

The HTML Importer exists to transform *unstructured human-authored web content*
into structured semantic material suitable for cognitive processing.

It is **not** a scraper.
It is **not** a parser.
It is **not** a document database loader.

It is an **ingestion boundary** between the external world and the internal
knowledge representation system.

The importer answers one architectural question:

> How does messy human information become stable cognitive input?

---

## Architectural Philosophy

### 1. Ingestion Is Interpretation, Not Downloading

Traditional pipelines treat HTML as data to extract.

This system treats HTML as:

- authored intent
- narrative structure
- semantic hierarchy
- contextual signals

The goal is not to preserve markup.

The goal is to preserve **meaning density**.

HTML is merely the transport format.

---

### 2. Separation of Concerns

The importer intentionally stops *before* higher cognition.

| Responsibility | Included | Excluded |
|---|---|---|
| Fetching | ✅ | |
| Structural normalization | ✅ | |
| Content extraction | ✅ | |
| Semantic interpretation | ⚠️ minimal |
| Knowledge graph creation | ❌ |
| Reasoning | ❌ |
| Memory decisions | ❌ |

The importer prepares material so downstream systems can think.

It does **not** think itself.

---

### 3. HTML as a Cognitive Signal

Web pages contain implicit structure:

- headings imply hierarchy
- paragraphs imply thought boundaries
- lists imply relationships
- links imply references
- layout implies emphasis

The importer preserves these signals while removing presentation noise.

Key principle:

> Preserve intellectual structure, discard visual structure.

---

### 4. Determinism Over Intelligence

The importer avoids LLM reasoning wherever possible.

Reasons:

- ingestion must be reproducible
- ingestion must be debuggable
- ingestion must be stable over time
- ingestion must not reinterpret history

LLMs may participate later in the pipeline,
but ingestion itself remains deterministic.

---

### 5. Canonicalization

Different sites express the same idea differently.

The importer attempts to normalize:

- whitespace
- encoding
- redundant markup
- navigation noise
- ads and boilerplate

The output should represent:

> what the author intended to convey,
> not how the browser chose to render it.

---

### 6. One-Way Flow

Ingestion does not:

- remember past decisions
- update existing knowledge
- create conversational context
- modify the internal knowledge graph

The importer produces:

- clean artifacts
- atomic inputs
- semantic snapshots

Downstream components then decide
how to integrate these artifacts.

---

## Key Concepts

### Content Artifact

A self-contained semantic unit produced by ingestion.

Properties:

- preserves authorial intent
- removes presentation noise
- maintains structural integrity
- is deterministic and reproducible
- is suitable for cognitive processing

Examples:

- cleaned HTML
- extracted paragraphs
- semantic hierarchy
- metadata objects

---

### Cognitive Signal Preservation

Transforming HTML features into semantic signals:

| HTML Feature | Semantic Signal |
|---|---|
| `<h1>`-`<h6>` | Topic hierarchy |
| `<p>` | Thought units |
| `<li>` | Enumerations / lists |
| `<a>` | External references |
| `<strong>`, `<em>` | Emphasis |
| Tables | Tabular data structures |
| Block structure | Logical flow |

---

### Deterministic Processing

No LLM use during ingestion.
All transformations must be:

- rule-based
- reproducible
- testable
- idempotent

This ensures that:

- the same HTML always produces the same output
- errors are traceable
- performance is predictable

---

## Component Relationships

```
┌────────────────────┐
│  External HTML     │
│  (Unstructured)    │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│  Importers         │
│  - PageImporter      │
│  - ArticleImporter   │
│  - Documentation     │
│    Importer          │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│  Content Artifacts │
│  - Cleaned HTML    │
│  - Semantic Blocks │
│  - Extracted Data  │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│  Downstream         │
│  Cognitive Systems  │
│  - Knowledge Graph  │
│  - Working Memory   │
│  - Reasoning Engine │
└────────────────────┘
```

---

## Implementation Boundaries

### What Importer Does

✅ Fetch HTML content
✅ Normalize encoding and whitespace
✅ Remove navigation and boilerplate
✅ Preserve semantic structure
✅ Extract meaningful content
✅ Create reproducible artifacts

### What Importer Avoids

❌ Creating knowledge graph nodes
❌ Establishing semantic relationships
❌ Reasoning about content meaning
❌ Making memory decisions
❌ Rewriting historical data
❌ Using LLMs for core logic

---

## Use Cases

### Valid Ingestion Use Cases

1. **Importing technical documentation**

   - Convert docs to clean artifacts
   - Preserve hierarchy and code examples
   - Allow downstream systems to index

2. **Ingesting articles and blog posts**

   - Extract main content
   - Remove ads and sidebars
   - Create semantic snapshots

3. **Processing web-based learning materials**

   - Preserve structure
   - Maintain logical flow
   - Support knowledge construction

4. **Archiving web content**

   - Create time-independent records
   - Remove presentation noise
   - Ensure reproducibility

---

### Invalid Ingestion Use Cases

❌ LLM reinterpreting historical conversations
❌ Automatic graph summarization
❌ Decision-making based on content
❌ Creating conversational context
❌ Updating existing knowledge base

---

## Deterministic Processing Rules

### 1. Identical Input → Identical Output

For the same HTML input, the importer must always produce:

- the same cleaned HTML
- the same artifact structure
- the same metadata

No random elements.
No model drift.

---

### 2. No Semantic Reinterpretation

The importer does not:

- infer intent
- summarize meaning
- create conceptual relationships
- reinterpret authorial decisions

These tasks belong to downstream systems.

---

### 3. Reproducible Transformations

All processing steps must be:

- deterministic
- testable
- transparent
- auditable

LLMs can assist, but cannot make final decisions.

---

## Output Artifacts

The importer produces:

1. Cleaned HTML
2. Semantic Block Hierarchy
3. Metadata Objects
4. Extracted Data (tables, code, lists)

These artifacts are:

- self-contained
- stable over time
- suitable for cognitive processing
- independent of browser rendering

---

## Testing Requirements

### Unit Tests

- Identical input → identical output
- Deterministic behavior
- Boundary condition handling
- Edge case coverage

### Integration Tests

- Correct transformation pipeline
- Proper artifact creation
- Metadata preservation
- Error handling

### Golden Tests

- Against known HTML samples
- Verifying semantic preservation
- Checking structural integrity

---

## LLM Participation Rules

### Where LLMs Are Allowed

✅ Feature extraction (when deterministic rules fail)
✅ Normalization assistance
✅ Content classification
✅ Metadata enrichment

### Where LLMs Are Forbidden

❌ Graph creation
❌ Knowledge decisions
❌ Historical interpretation
❌ Memory updates
❌ Conversational context

---

## Error Handling Philosophy

1. **Fail early, fail loudly**
2. **Never produce corrupted artifacts**
3. **Record all issues in logs**
4. **Document all warnings**
5. **Provide clear debugging information**

---

## Design Trade-offs

### Accepted Trade-offs

✅ Less flexible, more stable
✅ Slower, more reproducible
✅ Simpler, more debuggable
✅ Less intelligent, more reliable

### Avoided Trade-offs

❌ Higher intelligence at cost of stability
❌ Faster, but non-deterministic processing
❌ Simplified, but incomplete artifacts
❌ LLM-heavy processing

---

## Future Extensibility

### Safe Extensions

- New deterministic parsers
- Additional content extraction rules
- New artifact formats
- LLM-assisted feature extraction
- Improved normalization algorithms

### Forbidden Extensions

- Adding memory or reasoning capabilities
- Modifying historical data
- Creating graph-level relationships
- LLM-based semantic interpretation

---

## Summary

The HTML Importer is an **ingestion boundary** that:

- transforms HTML into semantic artifacts
- preserves authorial intent
- removes presentation noise
- enables deterministic processing
- supports downstream cognitive systems

It answers:

> How does messy human information become stable cognitive input?

It remains true to:

- Separation of concerns
- Deterministic processing
- Cognitive signal preservation
- One-way information flow

The importer transforms **documents** into **processable material**.

The Event Pipeline transforms that material into **history**.

---

## Future Evolution

Possible extensions include:

- adaptive boilerplate detection
- multi-format ingestion parity (PDF, Markdown, etc.)
- provenance tracking
- incremental re-ingestion

All future changes must preserve the core rule:

> Ingestion must remain stable even as intelligence evolves.
