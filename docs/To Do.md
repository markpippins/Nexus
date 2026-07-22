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
