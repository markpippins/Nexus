schema: nexus/peb Observability API

1. Event stream (low-level, append-only)

GET  /api/peb/events?since=<cursor>&event_type=&plan_id=&agent_role=
GET  /api/peb/events/{receipt_id}
POST /api/peb/events/{receipt_id}/replay        # sets replayed_at, re-runs downstream effects
GET  /api/peb/transactions/{id}
GET  /api/peb/transactions?entity_id=&tool_name=&admission_result=&since=

This is the thin layer over governance_events and transactions — cursor-paginated, filterable, good for a log-tail UI or feeding a message bus. Nothing clever here; it's the substrate everything else is built on.

2. Causal graph (the actual observability value)

GET /api/peb/transactions/{id}/lineage

This is the endpoint that matters most. Given a transaction id, walk and return in one payload:

the decisions row(s) tied to it, plus their parent_decision_id ancestry and any rollback_of chain
the traces tree rooted at that transaction (via parent_trace_id), each node carrying confidence and rejected_alternatives
any violations raised, joined against the capabilities the entity_id actually held at created_at (not now — capabilities expire, so this has to be an as-of join)
the governance_events with matching work_request_id/plan_id, ordered by created_at, with replayed_at surfaced so the UI can show "this was replayed on X"
GET /api/peb/decisions/{id}/chain?direction=ancestry|rollback
GET /api/peb/traces/{id}/tree                    # includes rejected_alternatives at each node
GET /api/peb/entities/{entity_id}/capability-gap  # attempted vs granted, over time

The capability-gap endpoint is worth calling out specifically: it's not "list violations," it's "for this entity, overlay every capabilities grant/expiry against every violations.capability_attempted" — that's the view that actually answers "was this agent trying to do something it was never supposed to, or did its grant just lapse at a bad time," which are very different governance stories.

3. Rollup / fleet health

GET /api/peb/health/circuit-breakers             # role_circuit_breaker, tripped-first sort
GET /api/peb/health/violations/summary?window=24h&group_by=severity|violation_type|entity_id
GET /api/peb/health/entropy?group_by=entropy_class    # decisions.entropy_class over time — churn/stability signal

decisions.entropy_class is an interesting field for a rollup — if it's tracking how disruptive a decision was, a time-series of entropy by class is a good "is the system getting more or less chaotic" dashboard, separate from raw violation counts.

4. State diffing

GET /api/peb/state/{key}/versions
GET /api/peb/state/{key}/diff?from=<version>&to=<version>   # diff content by checksum mismatch

state has version + checksum but no history table shown here — if old versions aren't retained elsewhere, this endpoint can't diff, it can only confirm drift. Worth checking whether state history lives in governance_events.payload or gets reconstructed from transactions.state_delta instead — if so, the diff endpoint is really a projection over transactions, not over state directly, which is a cleaner design anyway since it keeps state as pure current-value and transactions as the append-only ledger it can be replayed from.

5. Live stream

WS/SSE /api/peb/events/stream?plan_id=&agent_role=

For the topology viewer or a live governance dashboard — circuit breaker trips and violations are the two event types worth pushing proactively rather than polling.

