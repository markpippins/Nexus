# ROVER Pipeline — Processed Transcripts Registry

All rover transcript processing is complete. Artifacts are organized under
this directory:

- `chats/` — markdown copies of original chat transcripts
- `harvests/` — extraction harvests (candidates filed during Phase 0 freeze)

**Original location:** `nexus/audit/TRANSCRIPTS_READ.md` (redirect only)

---

| # | Transcript | Date | Job ID | Chunks | Content Chunks | Harvest | Status |
|---|------------|------|--------|--------|----------------|---------|--------|
| 1 | [Reviewing LOSM Risk Management System.html](/home/codex/dev/chats/Reviewing%20LOSM%20Risk%20Management%20System.html) | 2026-06-19 | `f75d35a2` | 21 | 1, 6, 20 | `harvests/losm-risk-management-harvested.md` | ✅ Complete |
| 2 | [System Evolution and Naming.html](/home/codex/dev/chats/System%20Evolution%20and%20Naming.html) | 2026-06-19 | `47e360e5` | 14 | 7, 9, 13 | `harvests/system-evolution-and-naming-harvested.md` | ✅ Complete |
| 3 | [CCNF Normalization vs Parsing.html](/home/codex/dev/chats/CCNF%20Normalization%20vs%20Parsing.html) | 2026-06-19 | `31e0b2c2` | 10 | 3, 4, 7, 8, 9 | `harvests/ccnf-normalization-vs-parsing-harvested.md` | ✅ Complete |
|   | _Approved plans extracted_ | | | | | 005, 006, 007, 008 | ✅ Done |
| 4 | [NLP Output from Chat Transcripts.html](/home/codex/dev/chats/NLP%20Output%20from%20Chat%20Transcripts.html) | 2026-06-19 | `150a1fd0` | 28 | 1, 5, 6, 12, 16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27 | `harvests/nlp-output-harvested.md` | ✅ Complete |
|   | _Approved plans extracted_ | | | | | 009, 010, 011, 012, 013, 014, 015, 016 | ✅ Done |
| 5 | [IRL IR Interaction System.html](/home/codex/dev/chats/IRL%20IR%20Interaction%20System.html) | 2026-06-19 | `d8665023` | 21 | 1, 2, 3, 5-14, 15, 16, 17, 18, 19, 20 | `harvests/irl-ir-interaction-system-harvested.md` | ✅ Complete |
|   | _Approved plans extracted_ | | | | | 017, 018, 019, 020, 021, 022, 023, 024 | ✅ Done |
| 6 | [Semantic IR v0.1 Overview.html](/home/codex/dev/chats/Semantic%20IR%20v0.1%20Overview.html) | 2026-06-19 | `2b695bb3` | 19 | 16 (WRP spec), 17 (migration), 18 (extensions), rest noise/repeats | `harvests/semantic-ir-wrp-harvested.md` | ✅ Complete |
|   | _Approved plans extracted_ | | | | | 025, 026, 027 | ✅ Done |
| 7 | [Strontium as Cognition Node.html](/home/codex/dev/chats/Strontium%20as%20Cognition%20Node.html) | 2026-06-20 | `90cce226` | 13 | 5-9 (VQL), 10-11 (Mem Consolidation), 12 (Time-Travel Viz) | `harvests/strontium-as-cognition-node-harvested.md` | ✅ Complete |
|   | _Stored as candidates (collapse freeze active)_ | | | | | VQL v0.1, MC v0.1, TTV v0.1 | ✅ Filed |

## Notes

- Content chunks are 0-indexed chunk indices that contain distinct conversation content
- Noise/duplicate chunks get empty extractions
- Harvest files live in `harvests/`
- Approved plans extracted from harvests live in `PLANS/approved/`
- Original chat HTML files remain at `/home/codex/dev/chats/`
- Pipeline complete — no further transcripts to process
