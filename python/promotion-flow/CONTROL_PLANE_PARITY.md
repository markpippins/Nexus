# Card-Parity Charter — nebula-control-plane

Per amendment 33c708e2 item 3, this surface is the **successor** for the
promotion-gate flow; nebula-ui freezes after cutover.

## Obligations
1. Render promotion decision cards exactly per the canonical spec:
   `/home/codex/dev/nexus/python/promotion-flow/CARD_SPEC.md` (v2 vocabulary:
   Requirement / Sandbox / Strike / Other=remap — no Plan option).
2. Post choices as `**Agreed selection:**` comment blocks (§2 of the spec) so
   `stage3_execute.parse_card_reply` parses them unmodified.
3. No local format forks; changes go through CARD_SPEC.md first.

## Integration point
Fetch open batches via conduit/nebula manifests (promotion-flow state dir);
render one card group per non-terminal candidate. Read-only until stage-3
HALT c19018b3 is lifted by the operator.
