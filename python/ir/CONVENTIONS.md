# IR Conventions

Cross-cutting rules for all modules under `nexus/python/ir/`. These apply
to all four layers (SM-IR, TEM-IR, Event-to-Lease, LS-IR) and their
interactions with NBK, MEEP, and Cascade.

---

## 1. Promotion Model (not inheritance)

NBK provides the **reference interpreter** — minimal, correct, easy to test.
IR types are **promoted representations** — the result of additional
compilation applied to NBK primitives.

```
NBK primitive          IR promoted type        Promotion step
──────────────────────────────────────────────────────────────────
Edge(from, to)    →    CausalEdge(type, epoch) causality inference
Trace(node, in, out) → StateVersion(data, hash) replay + snapshot
Lease(node, exec)  →   RoleLease(13 fields)    compilation pipeline
```

**Rule:** IR types never subclass NBK types. They are independent
`frozen=True` dataclasses that carry a `PromotionReceipt` recording how
they were derived.

**Wrong:**
```python
class CausalEdge(Edge):  # ❌ inheritance
    edge_type: CausalEdgeType
```

**Right:**
```python
@dataclass(frozen=True)
class CausalEdge:
    from_id: str
    to_id: str
    edge_type: CausalEdgeType
    promotion_receipt: PromotionReceipt | None

    @classmethod
    def from_nbk_edge(cls, edge: Edge, edge_type: CausalEdgeType) -> "CausalEdge":
        """Promote a raw NBK Edge into a typed CausalEdge."""
        ...
```

---

## 2. Frozen Dataclasses

All IR data types MUST be `frozen=True` dataclasses. Once constructed, they
are immutable. No setters, no mutation methods, no in-place modification.

```python
@dataclass(frozen=True)
class StateVersion:
    version_id: str
    data: dict
    causal_parents: list[str]
    source_event_id: str
    hash: str  # content-addressable
    promotion_receipt: PromotionReceipt | None
```

**Why:** Immutability enables deterministic replay, content-addressable
hashing, safe sharing across threads/leases, and auditable provenance.

**Exception:** Builders/accumulators (e.g., `StateDAG` internally) may use
mutable state during construction, but the final objects returned from
public methods must be frozen.

---

## 3. Promotion Receipts

Every transition from a simpler representation to a richer one MUST emit
a `PromotionReceipt`. Receipts are immutable records that say: "I promoted
representation X into representation Y."

```python
@dataclass(frozen=True)
class PromotionReceipt:
    receipt_id: str           # UUID
    from_type: str            # "Edge", "Trace", "CEREvent", "EventProjection", ...
    from_id: str              # ID of the source
    to_type: str              # "CausalEdge", "StateVersion", "CausalEvent", ...
    to_id: str                # ID of the promoted result
    stage: str                # "causality_inference", "from_cer_event", "project", ...
    metadata: dict            # stage-specific context
    timestamp: datetime
    compiler_version: str     # deterministic replay guarantee
```

### Receipt chains

Receipts form chains. A `ProvenanceGraph` is a sequence of receipts:

```
Edge → CausalEdge → ... CausalEvent → EventProjection → IntentGraph →
PromptIR → RoleLease → Dispatch
```

Chains are traversable in both directions:
- **Forward**: "What did this Edge become?"
- **Backward**: "Where did this RoleLease come from?"

### Receipt placement

| IR Layer | Promotion Path | Receipt Stage |
|---|---|---|
| SM-IR | NBK `Trace` → `StateVersion` | `replay_snapshot` |
| SM-IR | `CEREvent` → `StateVersion` | `event_to_state` |
| TEM-IR | NBK `Edge` → `CausalEdge` | `causality_inference` |
| TEM-IR | `CEREvent` → `CausalEvent` | `from_cer_event` |
| RL-IR | `CausalEvent` → `EventProjection` | `project` |
| RL-IR | `EventProjection` → `IntentGraph` | `compile_intent` |
| RL-IR | `IntentGraph` → `PromptIR` | `compile_prompt` |
| RL-IR | `PromptIR` → `RoleLease` | `instantiate` |
| LS-IR | `RoleLease` → `DispatchEvent` | `dispatch` |

---

## 4. Deterministic Replay

Given the same inputs, the same outputs (including `PromotionReceipt` chains)
must be produced. This applies to:

- **SM-IR**: Replaying the same `CERLog` → same `StateDAG` + same
  `StateVersion` hashes
- **TEM-IR**: Same NBK graph → same `CausalGraph` topology + same
  `CausalEdge` types
- **RL-IR**: Same events + same role → same `RoleLease` + same receipt chain
- **LS-IR**: Same `WorkSurface` + same `LeasePool` → same dispatch order

### Determinism rules

1. **No wall-clock-dependent decisions.** `datetime.now()` may appear in
   metadata but never in identity or ordering logic.
2. **No random tie-breaking.** Use `argmax` (first-valid wins ties), not
   `random.choice` or shuffle.
3. **Stable sorting.** When sorting for iteration order, use a total
   order (e.g., sort by `(priority, event_id, causal_epoch)`).
4. **Content-addressable hashing.** `StateVersion.hash`,
   `PromotionReceipt.receipt_id` (UUIDv5 from deterministic inputs),
   and any other integrity fields must be pure functions of input data.

### Compiler version

`PromotionReceipt.compiler_version` is a string like `"ir-v1.0.0"`. If the
promotion logic changes, bump the version. This ensures old receipts can be
distinguished from new ones during replay.

---

## 5. Serialization

All IR types MUST support JSON round-trip:

```python
@dataclass(frozen=True)
class CausalEdge:
    ...

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "CausalEdge":
        return cls(**d)
```

**Rule:** Use `dataclasses.asdict()` for `to_dict` and direct `**kwargs`
for `from_dict`. Custom serialization only for non-dataclass fields
(e.g., `datetime` → ISO string, `set` → sorted list).

---

## 6. NBK / MEEP / Cascade Boundaries

IR modules depend on NBK, MEEP, and Cascade as **read-only sources**. They
never modify upstream types:

- IR reads `Edge` from NBK — never writes back
- IR reads `CEREvent`/`CERLog` from MEEP — never modifies
- IR reads `CanonicalEnvelope` from Cascade — never mutates
- IR writes its own promoted types to `nexus/python/ir/` (or the DB)

Upstream systems are unaware of IR. No circular dependencies.

---

## 7. Testing Conventions

- **Unit tests** per file: `nexus/python/ir/tests/test_<module>.py`
- **Integration tests** across layers: e.g., `test_state_replay.py` tests
  SM-IR + MEEP integration
- **Determinism tests**: verify that replay produces identical outputs
- **Promotion receipt tests**: verify receipt chains are complete and
  traversable
- **Serialization tests**: verify JSON round-trip for every type
- Run: `pytest nexus/python/ir/tests/ -v`

---

## 8. Naming

| Convention | Example |
|---|---|
| `snake_case` for modules | `causal_edge.py`, `lease_pool.py` |
| `PascalCase` for types | `CausalEdge`, `RoleLease`, `StateDAG` |
| `snake_case` for fields | `edge_type`, `lease_id`, `causal_epoch` |
| `UPPER_SNAKE` for enum values | `CAUSES`, `ENABLES`, `PENDING` |
| `from_` prefix for promotion factories | `from_nbk_edge()`, `from_cer_event()` |

---

## 9. Layer Build Order

```
SM-IR (v0136)  ── first, everything needs stable state
  ↓
TEM-IR (v0137) ── second, causality connects stable state versions
  ↓
Event-to-Lease (v0139) ── third, derive execution intent from state + causality
  ↓
LS-IR (v0138)   ── last, scheduling consumes all prior semantics
```

Each layer adds to `nexus/python/ir/`. Earlier layers are imported by
later layers, never the reverse.
