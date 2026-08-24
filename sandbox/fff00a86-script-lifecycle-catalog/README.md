# script-lifecycle-catalog (sandbox)

**Claimed behavior:** a zero-dependency Python CLI that walks a directory of
scripts, extracts lifecycle metadata (purpose, last-modified, entrypoint
shape), classifies each script as `recurring-job`, `ui-capability`, or
`historical-artifact`, and writes/updates a `catalog.json` with an audit trail
of classification changes.

## Why this exists
Candidate `fff00a86` asks: *"Store and catalog every one-off script with enough
metadata to preserve why it existed, so future questions like 'Can I delete
repair_transition_ids.py?' can be answered from records rather than guesswork."*
This sandbox is the evidence-by-construction answer: build the smallest thing
that makes that question answerable, without touching mainline.

## Usage (once implemented)

```bash
python3 catalog.py scan <dir>            # classify scripts, print table
python3 catalog.py update <dir>          # write/update catalog.json
python3 catalog.py why <script-name>     # print provenance + deletion verdict hint
```

## Classification heuristic (v0 claim)
- shebang/cron references or name matches `*job*`, `*cron*`, timer units → `recurring-job`
- imports of a web framework or `server` in name → `ui-capability`
- everything else, if unmodified > 90 days and unreferenced → `historical-artifact`

## Status
- [x] scaffold + provenance (this commit)
- [ ] catalog.py v0 (scan + classify)
- [ ] catalog.json writer + change audit
- [ ] self-test on nexus/bin sample

Built under ruling c26ca340 (sandbox track). See PROVENANCE.md.
