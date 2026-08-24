# SOLScript

In-memory interpreter for the **resolution schema language** — the semantic
evaluation surface used by the Nexus resolution pipeline.  SOLScript loads
concepts, entities, rules, and propositions from the PostgreSQL resolution
database (or builds them programmatically), compiles expression trees into
callable Python functions, and evaluates them against live entity state.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ResolutionInterpreter                   │
│  (concepts, entities, propositions, rules, representations) │
├──────────┬──────────┬────────────┬──────────────────────────┤
│ Expression│ Inference│   Query    │     Database Loader      │
│ Compiler │  Engine  │  Builder   │  (asyncpg → interpreter) │
├──────────┴──────────┴────────────┴──────────────────────────┤
│                        Models                               │
│  Concept · Entity · Rule · Proposition · Expression · ...   │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│       Reasoning Layer         │
│  DeterministicReasoner        │
│    ├─ RuleEngine              │
│    ├─ SymbolicReasoner        │
│    ├─ PatternMatcher          │
│    ├─ StatisticalReasoner     │
│    └─ DecisionTreeReasoner    │
│  HybridReasoner               │
│    ├─ DeterministicReasoner   │
│    └─ LLMIntegrationLayer     │
│  DeterministicPatternLibrary  │
│    └─ 10 pre-LLM patterns    │
└───────────────────────────────┘
```

### Module Map

| Module | Responsibility |
|--------|---------------|
| `models.py` | All enums and dataclasses — the type vocabulary for the resolution language (incl. v31 frame dimensions + v35 frame-dimension meanings) |
| `expression_compiler.py` | Compiles `Expression` trees into executable `(ctx) -> value` callables with caching |
| `interpreter.py` | Core engine: concept graph, entity store, proposition evaluation, invariant checking, change events |
| `inference_engine.py` | Forward/backward chaining with confidence scoring and external knowledge base delegation |
| `query_builder.py` | Fluent query DSL (`select → filter → order → limit → execute`) plus transactional context |
| `database_loader.py` | Async loader that populates the interpreter from the resolution PostgreSQL schema via `asyncpg` |
| `reasoning/deterministic.py` | Five deterministic reasoners (rule, statistical, symbolic, pattern, decision-tree) plus `HybridReasoner` and `LLMIntegrationLayer` |
| `reasoning/pattern_library.py` | 10 deterministic pre-LLM patterns (temporal consistency, enum validation, FK validation, state machine, etc.) |

### Design Principles

1. **Deterministic-first.** Every pattern runs deterministically before any
   LLM call.  The `HybridReasoner` only escalates to the LLM layer when
   deterministic methods produce unknowns below the confidence threshold
   (0.85).

2. **Compiled expressions.**  Expression trees are compiled into Python
   callables once and cached.  Repeated evaluation of the same proposition
   reuses the compiled form.

3. **Immutable evidence.**  Once a reasoning pattern produces a result, it is
   recorded as evidence.  The evidence append-only contract from the resolution
   schema is enforced in-memory.

4. **Schema-correlated, not schema-dependent.**  The interpreter correlates to
   the resolution schema via text IDs (concept names, entity IDs) but has no
   hard FK to the database.  It can operate fully in-memory without a DB
   connection.

## Quick Start

### In-memory (no database)

```python
from solscript import ResolutionInterpreter, Concept, ConceptAttribute, \
    Entity, Expression, ExpressionKind, Rule, RuleType, Severity, \
    Proposition, Disposition

interp = ResolutionInterpreter()

# Define a concept
wr = Concept(id="wr-1", name="WorkRequest", description="A work request")
interp.add_concept(wr)

# Add a state attribute
status = ConceptAttribute(
    id="attr-1", concept_id=wr.id, name="status",
    value_type="text", is_state_attribute=True,
    allowed_values=["DRAFT", "APPROVED", "DONE"],
)
wr.attributes[status.id] = status

# Add an invariant rule
expr = Expression(
    id="expr-1", kind=ExpressionKind.ATTRIBUTE_REF,
    return_type="text", attribute_id=status.id,
)
rule = Rule(
    id="rule-1", name="Status must not be null",
    rule_type=RuleType.INVARIANT, expression=expr,
    severity=Severity.HARD, concept_id=wr.id,
)
wr.invariants.append(rule)
interp.rules[rule.id] = rule

# Create an entity and evaluate
entity = interp.add_entity_by_concept_name(
    "WorkRequest", {"status": "DRAFT"}, external_id="WR-001",
)

prop = Proposition(
    id="prop-1", title="WorkRequest is valid",
    asset_concept_id=wr.id, subject_entity_id=entity.id,
    disposition=Disposition.PENDING, assertions=[rule],
)
interp.add_proposition(prop)

result = interp.evaluate_proposition(prop)
print(result)  # → {"passed": True, "disposition": "APPROVED", ...}
```

### From the database

```python
import asyncio
import asyncpg
from solscript import ResolutionInterpreter, DatabaseLoader

async def main():
    pool = await asyncpg.create_pool("postgresql://user:pass@localhost/resolution")
    interp = ResolutionInterpreter()
    loader = DatabaseLoader(interp, pool)

    await loader.load_all()        # concepts, attributes, relationships, rules, propositions
    await loader.load_entities()   # entity instances

    # Now evaluate propositions against live entities
    for prop in interp.propositions.values():
        result = interp.evaluate_proposition(prop)
        print(f"{prop.title}: {result['disposition']}")

asyncio.run(main())
```

### Built-in example

```bash
cd nexus/python/SOLScript
source .venv/bin/activate
python -m solscript
```

This runs a self-contained demo that creates a `WorkRequest` concept,
evaluates invariants, fires change events, and exercises hybrid reasoning
with a mock LLM.

## Querying

```python
from solscript import QueryBuilder, Expression, ExpressionKind, Operator

qb = QueryBuilder(interp)

# Select all WorkRequest entities
results = qb.select("WorkRequest").execute()
print(f"Found {len(results)} WorkRequests")

# Filter with an expression
filtered = (
    qb.select("WorkRequest")
    .filter(Expression(
        id="f1", kind=ExpressionKind.OPERATOR,
        operator=Operator.EQ, return_type="boolean",
        children=[
            Expression(id="f1a", kind=ExpressionKind.ATTRIBUTE_REF,
                       return_type="text", attribute_id="attr-1"),
            Expression(id="f1b", kind=ExpressionKind.LITERAL,
                       return_type="text", literal_value="APPROVED"),
        ],
    ))
    .order_by("created_at", descending=True)
    .limit(10)
    .execute()
)
```

## Reasoning

### Hybrid Reasoner

The `HybridReasoner` chains deterministic methods first, then escalates to
the LLM only for unknowns:

```python
from solscript.reasoning import HybridReasoner

class MyLLM:
    def generate(self, prompt: str) -> str:
        return '{"priority": "High"}'

hybrid = HybridReasoner(interp, MyLLM())
result = hybrid.reason({"entity": entity})
# result contains deterministic findings + LLM-filled unknowns
```

### Deterministic Pattern Library

10 pre-LLM patterns that run with high confidence before any LLM call:

| Pattern | Priority | Confidence | Description |
|---------|----------|------------|-------------|
| `temporal_consistency` | 100 | 0.95 | Ensures date fields are logically ordered |
| `enum_validation` | 90 | 1.0 | Validates attribute values against allowed lists |
| `consistency_constraints` | 95 | 0.98 | Cross-attribute consistency checks |
| `state_machine` | 95 | 1.0 | Validates state transitions against defined rules |
| `foreign_key_validation` | 85 | 1.0 | Validates FK references resolve to existing entities |
| `range_validation` | 85 | 0.98 | Numeric range validation |
| `business_rules` | 90 | 0.9 | Domain-specific deterministic rules |
| `derived_attributes` | 80 | 0.95 | Calculates derived/computed attributes |
| `text_pattern_matching` | 70 | 0.85 | Regex-based text attribute validation |
| `statistical_imputation` | 60 | 0.75 | Statistical fill for missing values |

```python
from solscript.reasoning import DeterministicPatternLibrary

lib = DeterministicPatternLibrary(interp)
for pattern in lib.patterns:
    if pattern.priority >= 85:
        result, confidence = pattern.apply({"entity": entity})
        if result:
            print(f"[{pattern.name}] {result} (conf: {confidence:.2f})")
```

## Project Structure

```
SOLScript/
├── pyproject.toml              # Package metadata + pyright config
├── .venv/                      # Python 3.10 venv with pyright
├── README.md
└── solscript/
    ├── __init__.py             # Public API (26 exports)
    ├── __main__.py             # CLI example
    ├── models.py               # All enums + dataclasses (22 types)
    ├── expression_compiler.py  # Expression → callable compiler
    ├── interpreter.py          # ResolutionInterpreter (core engine)
    ├── inference_engine.py     # Forward/backward chaining + KnowledgeBase
    ├── query_builder.py        # Fluent query DSL + TransactionContext
    ├── database_loader.py      # asyncpg loader for resolution schema
    └── reasoning/
        ├── __init__.py         # Reasoning subpackage exports
        ├── deterministic.py    # RuleEngine, Statistical, Symbolic, Pattern,
        │                       # DecisionTree, LLMIntegration, HybridReasoner
        └── pattern_library.py  # 10 deterministic pre-LLM patterns
```

## Setup

```bash
cd nexus/python/SOLScript
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"        # installs pyright for type checking
pip install -e ".[db]"         # adds asyncpg for database loading
```

### Type checking

```bash
pyright                       # 0 errors, 0 warnings
```

## Dependencies

- **Runtime:** none (pure Python 3.10+, zero required dependencies)
- **Database loading:** `asyncpg >= 0.29` (optional, install with `pip install -e ".[db]"`)
- **Dev:** `pyright >= 1.1`

## Relationship to the Resolution Schema

SOLScript is the **in-memory evaluation engine** for the resolution schema.
It correlates to the schema tables but does not depend on them at runtime:

| Schema Table | SOLScript Model |
|-------------|----------------|
| `resolution.concept` | `Concept` |
| `resolution.concept_attribute` | `ConceptAttribute` |
| `resolution.concept_relationship` | `ConceptRelationship` |
| `resolution.concept_state_transition` | `ConceptStateTransition` |
| `resolution.entity` | `Entity` |
| `resolution.expression` | `Expression` |
| `resolution.rule` | `Rule` |
| `resolution.proposition` | `Proposition` |
| `resolution.frame_dimension` | `FrameDimension` |
| `resolution.frame_dimension_value` | `FrameDimensionValue` |
| `resolution.proposition_frame_value` | `PropositionFrameValue` |
| `resolution.frame_dimension_meaning` | `FrameDimensionMeaning` |
| `resolution.representation` | `Representation` |
| `resolution.execution_claim` | *(evaluated via InferenceEngine)* |

The interpreter can be populated from the database via `DatabaseLoader` or
built entirely in memory.  Dropping the semantics or resolution schemas does
not affect SOLScript's internal state.
