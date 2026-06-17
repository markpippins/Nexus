# Graph Examples

These examples demonstrate the capability graph model across different
domains. The model is intentionally domain-agnostic — software engineering,
bartender scheduling, and filesystem monitoring all produce the same
graph shapes.

## Domain Mapping

| System Concept | Scheduling | Filesystem |
|----------------|------------|------------|
| Atten | Bar state, inventory, staff | Directory tree, file metadata |
| Vision | Interpreting order flow vs capacity | Detecting structural vs content changes |
| Deterministic | Labor law, shift minimums | Path validation, extension filtering |
| External Tool | Schedule optimizer, payment processor | inotify, stat, database writer |
| Inference | Forecasting busy periods | Classifying change significance |
| Work Request | Shift commitment | Scan request |

## The Core Claim

> Workflows assume a capability graph, not a domain.

The three node types (Inference, Deterministic, External Tool) are
universal. The same graph structure that schedules bartenders also
compiles code and observes filesystems. Only the implementations change.
