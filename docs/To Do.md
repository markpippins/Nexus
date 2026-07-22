missing foreign keys,
orphanable relationships,
missing uniqueness constraints,
inconsistent nullability,
unattached triggers,
unused trigger functions,
functions that claim to be sole write surfaces,
direct write privileges that bypass those functions,
constraints that exist in migrations but not in the actual database,
schema drift,
inconsistent naming or structural patterns,
suspicious JSONB columns,
polymorphic associations without integrity guarantees,
views with recursive queries lacking cycle protection,
indexes that don't correspond to common access paths,
tables that accumulate data but have no apparent lifecycle,
audit records with broken cross-references.


1. Understand PEB
2. Understand Vision
3. Understand Kernel
4. Reintroduce Voyager
5. Identify no-ops and orphaned integration points
6. Establish Spring ↔ NATS connectivity where appropriate
7. Clarify event ownership
8. Clarify choreography
9. Finish housekeeping
10. Bring Substance online
11. Establish evidence layer
12. Reset active interpretations
13. Rediscover


1. The view/table distinction matters for this role. Several "tables" are actually views (harvests, requirements, agent_records). The DBA needs to know this because:
- Write-surface verification for views is different (INSTEAD OF triggers vs direct grants)
- Projection drift checks apply to views + their underlying tables, not the views alone
- The orphan scan in harvest_candidate_embeddings references harvest_candidates.harvest_id which has no FK because harvests is a VIEW with churn — the DBA would flag this as a GAP unless it knows the context
2. The newer schemas are missing from the identity block. operator, terrain, assembly, nebula, and tackle exist. The prompt says "and any schema added after this prompt was written" which is fine, but listing the current set avoids ambiguity about scope.
3. The continuity section is vague on mechanics. It says "write a receipt or event" but doesn't specify how. The DBA should know: use nebula_create_agent_record with recordType: inspection and appropriate tags, or query pg_proc/pg_trigger directly. Without this, the DBA has to guess how to leave its own audit trail.
4. No mention of the pg_notify → NATS bridge. The prompt covers pg_notify delivery integrity but doesn't mention that cascade-obs-subscriber bridges pg_notify to NATS. A silent failure in the subscriber means governance events and lifecycle events stop reaching NATS without anyone noticing — this is exactly the kind of "nothing would notice" scenario the prompt teaches the DBA to look for.
5. The execution schema's lease system isn't called out. The stale-lease sweep (execution.sweep_stale_leases()) and attempt/lease consistency trigger (trg_attempt_lease_consistency) are active enforcement mechanisms. The DBA should audit whether the sweep interval matches the lease duration, and whether the consistency trigger actually prevents the inconsistencies it claims to.
6. The V048 trigger on open_questions is worth flagging. It fires pg_notify on answered_by change and status change to RESOLVED — but the answer/resolve endpoints do direct SQL UPDATE. The DBA should verify the trigger actually fires (it does, because it's AFTER UPDATE on the table), but the split between "endpoint does SQL" and "trigger does pg_notify" is exactly the kind of delivery-path fragility the prompt teaches about.
