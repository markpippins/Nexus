>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# REQUIREMENTS SYSTEM — MULTI-AGENT COORDINATION v1

## 1. CORE PRINCIPLE
All agents are stateless projections over a shared, append-only event log.
Agents:
- do not own state
- do not mutate state directly
- only propose events

## 2. AGENT MODEL
### 2.1 Agent Definition
```json
Agent = {
  "agent_id": "str",
  "role": "planner | implementer | tester | resolver",
  "view": "query_snapshot",
  "capabilities": ["str"]
}
```

### 2.2 Agent Constraint
Agents are strictly:
`f(INDEX, GRAPH, QUERY) → PROPOSED_EVENTS`

Not:
- stateful systems
- schedulers
- authoritative executors

## 3. SHARED SYSTEM BOUNDARY
All agents operate on:

### 3.1 Immutable inputs
- `EVENT_LOG` (append-only)
- `REDUCED SNAPSHOT` (INDEX + GRAPH at time T)

### 3.2 Ephemeral outputs
- Event proposals only

## 4. EVENT PROPOSAL MODEL
### 4.1 Proposed Event
```json
ProposedEvent = {
  "agent_id": "str",
  "event": "Event",
  "confidence": "float",
  "justification": "str"
}
```

### 4.2 Rule
No agent may directly append to the event log. All events go through arbitration.

## 5. ARBITRATION LAYER
This is the concurrency control mechanism.

### 5.1 Arbitration function
```python
def arbitrate(proposed_events: list[ProposedEvent]) -> list[Event]:
    ...
```

### 5.2 Arbitration outputs
- accepted events
- rejected events
- conflict events (meta-level)

## 6. CONFLICT RESOLUTION BETWEEN AGENTS
Yes—agents can conflict too.

### 6.1 Conflict types
- **A1 — Contradictory proposals**: Two agents propose incompatible events (e.g., `REQ_SUPERSEDED` vs `REQ_REFINED` on same req_id).
- **A2 — Duplicate event emission**: Same semantic event proposed twice.
- **A3 — Structural race condition**: Two agents modify same node concurrently.
- **A4 — Failure cascade**: One agent's failure event blocks another agent's proposals via FAILURE_AFFECTS edges, requiring explicit resolution before the blocked agent may proceed.

## 7. ARBITRATION STRATEGIES
All arbitration MUST use one of these deterministic policies:

### 7.1 CONFIDENCE PRIORITY
Higher confidence wins.
*Tie-breaker*: agent_id lexicographic order.

### 7.2 ROLE PRIORITY
Fixed hierarchy:
`resolver > implementer > planner > tester`

### 7.3 EVENT TYPE PRIORITY
Some events override others:
`REQ_INVALIDATED > REQ_REFINED`
`REQ_SUPERSEDED > REQ_IMPLEMENTED`

### 7.4 FIRST-VALID WINS (ORDERED LOG)
If deterministic ordering exists: earliest valid event wins.

### 7.5 CONSENSUS MODE (optional)
If enabled: accept only events supported by ≥ N agents.

## 8. GLOBAL CONSISTENCY RULE
### 8.1 Single-log truth
There is exactly one event log for all agents. No per-agent forks.

### 8.2 No divergence rule
If two agents produce different results from same snapshot: divergence is resolved at arbitration, not execution.

## 9. CONCURRENCY CONTROL MODEL
This system is:
**NOT**: lock-based, transactional, distributed consensus (like Raft).
**BUT**: log-serialized deterministic arbitration system.

### 9.1 Serialization rule
All accepted events are appended in a single total order.

### 9.2 Deterministic ordering rule
If timestamps conflict:
`ORDER = (timestamp, agent_priority, event_id)`

## 10. EXECUTION UNDER CONCURRENCY
### 10.1 Execution rule
Agents may execute tasks concurrently ONLY if:
- no overlapping req_id in ACTIVE execution set
- OR conflicts resolved upstream

### 10.2 Safe parallelism condition
```python
parallel_safe(req_a, req_b) =
  no shared upstream dependencies
  AND no unresolved conflicts
```

## 11. FEEDBACK INTEGRATION
All agent outputs feed back via events:
- **11.1 Implementation feedback**: `REQ_IMPLEMENTED`
- **11.2 Refinement feedback**: `REQ_REFINED`
- **11.3 Conflict discovery**: `CONFLICT_DETECTED` (from previous layer)

## 12. SYSTEM OF SYSTEMS VIEW
You now have:
- **12.1 Global system**: Single event-sourced truth
- **12.2 Local agents**: Stateless projection functions
- **12.3 Arbitration layer**: Deterministic merge of competing interpretations

## 13. CRITICAL INVARIANTS
- **I1 — No agent authority**: Agents never decide truth, only propose it.
- **I2 — Total ordering of truth**: Event log is a single linearizable sequence.
- **I3 — Deterministic replay**: Same events + same arbitration rules ⇒ identical system.
- **I4 — No hidden consensus**: Consensus is explicit in arbitration, not emergent.
- **I5 — No split-brain state**: There is never more than one authoritative graph.

## 14. FINAL ARCHITECTURE (FULL STACK COMPLETE)
You now have a complete system:
1. **Event layer**: Append-only intent history
2. **Reducer**: Deterministic state + graph construction
3. **Graph semantics**: Causal + lineage structure
4. **Query DSL**: Composable reasoning layer
5. **Execution layer**: Task projection system
6. **Conflict system**: Explicit ambiguity modeling + resolution
7. **Multi-agent layer**: Concurrent proposal system + deterministic arbitration
8. **Failure integration (this layer)**: Failure cascade detection + agent divergence routing

## 15. FINAL FORMULA
```text
AGENTS (parallel)
  → propose events
    → ARBITRATION (total order)
      → EVENT LOG (single truth)
        → REDUCER
          → INDEX + GRAPH
            → QUERY DSL
              → EXECUTION
                → CONFLICT SYSTEM
                  → FAILURE DETECTION
                    → FAILURE GRAPH
                      → EVENTS
                        → AGENTS
```
Closed loop. Fully deterministic. Concurrency-safe by construction. Failure-safe by design.

## 16. ONE-SENTENCE SUMMARY
The system supports concurrent multi-agent reasoning by restricting agents to stateless event proposal, enforcing a deterministic arbitration layer that linearizes all outputs into a single event log, and routing agent divergence and failure cascades through the failure graph, preserving a globally consistent event-sourced requirement graph under parallel execution.
