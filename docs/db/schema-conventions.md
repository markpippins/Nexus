# Nexus database schema conventions

## Temporal naming

For new or touched bitemporal history surfaces, use:

- `recorded_on_dt` — system-time/recording interval start.
- `recorded_until_dt` — system-time/recording interval end.

The W2 open-question answer history migration applies this convention to
`nebula.open_question_answers_history` and its `nebula.open_question_answers`
view. The answer-history `metadata.content_lost` marker is the canonical way to
represent an answer fact whose source content is no longer recoverable; the
system must not manufacture replacement answer text.

## Known deviations

The following existing history surfaces still use `as_of_dt` /
`expiration_dt`. They are intentionally not part of a broad rename campaign and
should be corrected when their write/read surfaces are next changed:

- `conversation_blocks_history`
- `conversation_snapshots_history`
- `harvest_references_history`
- `projection_overrides_history`
- `segments_history`
- the remaining legacy bitemporal surfaces covered by the SCD-4 migration set

A future migration must update the owning view, trigger functions, and all
application references together; renaming only the base-table columns is not a
complete change.
