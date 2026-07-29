# Rover Pipeline — Stage 2 Prompts

Stage 1 (Dockling → DockLang) is unchanged. This replaces the old single-pass
"Stage 2 — Inference" with two separate operations: **2A Extraction** (recall)
and **2B Filing** (precision). Run them as distinct calls/tools, not two
instructions inside one prompt.

---

## Operation 2A — Candidate Extraction (recall pass)

**Input:** the DockLang JSON for one transcript (`discourse_units[]`, `stats`).
**Tools available:** none. Deliberately no access to `nebula_list_systems`,
`nebula_list_subsystems`, or `nebula_list_features` in this step — the goal is
to read the conversation on its own terms, not to reach for whatever already
exists in the hierarchy.
**Output:** a flat JSON list of raw candidate fragments. No filing, no
hierarchy decisions.

```
You are reading a technical conversation, represented as DockLang discourse
units, to find every idea in it that is load-bearing — something that shaped
a decision, a design, or an understanding, even if it produced no immediate
action item.

Your only job right now is to notice things. Do not try to classify them
against any existing system architecture — you don't have access to it, and
that's intentional. Just extract.

Look across the WHOLE conversation, not block-by-block. Some of the most
important things here are not stated once in a single place — they're a
principle mentioned early that quietly governs three decisions made later.
Track those threads.

For each fragment you find, classify it as one of:

- requirement          — an explicit acceptance criterion or thing to build
- principle            — a stated value, heuristic, or mantra that governs
                          design choices ("we don't delete rows, we expire
                          them" is the template case: not a task, a rule)
- rejected_alternative  — an approach considered and explicitly turned down,
                          and why
- tension               — a contradiction, unresolved disagreement, or a
                          "this doesn't sit right" moment that wasn't fully
                          resolved in the conversation
- rationale             — the reasoning behind a decision, independent of
                          the decision's stated content
- open_question         — something left genuinely unresolved

Bias toward over-catching. This is a recall pass; a filing step downstream
will filter and merge. Do not skip something because it seems minor, obvious,
or off-topic to the main thread of the conversation — a stray aside is often
where a principle gets stated.

For each fragment, output:

{
  "type": "requirement | principle | rejected_alternative | tension | rationale | open_question",
  "summary": "1-2 sentences, in your own words",
  "block_indices": [list of DockLang block_index values that support this —
                     may be non-contiguous and span the whole conversation],
  "quote_or_paraphrase": "a short grounding excerpt or close paraphrase",
  "confidence": "high | medium | low — how sure you are this is worth
                 surfacing, not how sure you are of the paraphrase"
}

Two worked examples of the difference between what to catch and what to skip:

- SKIP (too granular, not load-bearing): "the author used a semicolon
  instead of a comma in one code sample."
- CATCH (principle, easy to miss): the author says something like "actually,
  let's not add a delete endpoint here — we've never deleted rows in this
  system, we expire them," in the middle of an unrelated schema discussion.
  This is a governing principle, not a requirement, and it's easy to walk
  past because it's phrased as an aside.

Return only the JSON list. No commentary.
```

---

## Operation 2B — Hierarchy Filing (precision pass)

**Input:** the raw candidate list from 2A. **Not** the original transcript —
this operation never re-reads the source material, only the extracted
fragments.
**Tools available:** `nebula_list_systems`, `nebula_list_subsystems`,
`nebula_list_features`, `nebula_create_harvest_candidate`.
**Behavior:** draft the full mapping for every raw candidate first, and stop
for review before any writes — do not call `nebula_create_harvest_candidate`
until the draft mapping has been approved. This matches the append-only,
review-before-commit posture of the rest of the system.

```
You are given a list of raw candidate fragments extracted from a technical
conversation. Your job is to map each one onto the Nebula hierarchy — you are
not extracting anything new, only deciding where each fragment belongs.

For each fragment:

1. Query nebula_list_systems, nebula_list_subsystems, nebula_list_features to
   find the best-fitting node.
2. If there's a clean match, map it there.
3. If there is NOT a clean match, do not force it into the nearest existing
   node and do not drop it. Instead, flag it explicitly:
   {"needs_new_node": true, "proposed_parent": "...", "proposed_name": "...",
    "reason": "..."}
   A flagged-for-review fragment is a valid, complete output. Silently
   discarding a fragment because it doesn't fit anywhere is not acceptable.

4. For fragments typed "principle", "rejected_alternative", "tension", or
   "rationale" in the input, do NOT compress them into implementation_notes.
   Give them their own field so they survive as what they are:

   {
     "title": "...",
     "status": "Proposed | Agreed | Superseded",
     "intent_description": "...",
     "requirements": ["..."],
     "design_rationale": ["stated principles, rejected alternatives, or
                            reasoning that shaped this — even if no action
                            item follows from it"],
     "implementation_notes": ["..."],
     "code_snippets": [{"language": "...", "purpose": "...", "raw_code": "..."}],
     "open_questions": ["..."],
     "provenance_block_indices": [list, carried over from the raw fragment]
   }

5. Fragments typed "requirement" map primarily to requirements/
   implementation_notes as before. Fragments typed "open_question" map to
   open_questions. Everything else (principle/rejected_alternative/tension/
   rationale) should land in design_rationale unless it also implies a
   concrete requirement, in which case note both.

Produce the full draft mapping for every input fragment — including the
needs_new_node flags — as your output. Do not call
nebula_create_harvest_candidate yet. Wait for explicit approval of this
draft before filing anything.
```

---

---

## Expanded Candidate Schema

This is the full schema `nebula_create_harvest_candidate` should accept,
replacing the original requirement-only shape. It's additive — every
existing field keeps its meaning, nothing is renamed, so anything currently
querying `requirements`/`implementation_notes`/`code_snippets`/
`open_questions` keeps working unchanged.

```json
{
  "title": "Action-oriented title for the candidate",
  "status": "Proposed | Agreed | Superseded",
  "type": "requirement | principle | rejected_alternative | tension | rationale | mixed",
  "intent_description": "Business objective or core logic discussed",

  "requirements": ["bullet-point acceptance criteria"],

  "design_rationale": [
    "Stated principles, rejected alternatives, or reasoning that shaped a
     decision — even when no concrete action item follows from it. This is
     where a candidate typed 'principle', 'rejected_alternative', 'tension',
     or 'rationale' lives. Do not compress these into implementation_notes."
  ],

  "implementation_notes": ["technical infrastructure or architectural boundaries"],

  "code_snippets": [
    {"language": "python | typescript | bash | sql | etc.",
     "purpose": "Short sentence explaining what this code implements",
     "raw_code": "EXACT executable code, never truncated"}
  ],

  "open_questions": ["unresolved points or blockers"],

  "provenance_block_indices": [12, 13, 47],

  "confidence": "high | medium | low — optional, carried over from the
                 extraction pass; how sure the extractor was this was worth
                 surfacing at all, distinct from confidence in the paraphrase",

  "needs_new_node": false,
  "proposed_parent": null,
  "proposed_name": null,
  "placement_reason": null
}
```

Notes on the new fields:

- **`type`** — set from the raw candidate's extraction type. Use `"mixed"`
  when a fragment carries both a rationale and a concrete requirement (e.g. a
  rejected alternative that also produced a follow-up task) rather than
  forcing a single label.
- **`design_rationale`** — the field this whole exercise was for. A candidate
  can have requirements empty and design_rationale populated — that's a
  valid, complete candidate on its own, not a stub waiting for a requirement.
- **`provenance_block_indices`** — replaces a single `block_index` with a
  list, since design-rationale-type candidates are frequently grounded
  across non-contiguous blocks rather than one.
- **`needs_new_node` / `proposed_parent` / `proposed_name` / `placement_reason`**
  — set together when Operation 2B can't find a clean hierarchy match.
  A candidate filed this way should still be created (with `system_id`/
  `subsystem_id`/`feature_id` left null) rather than dropped, so it surfaces
  in Nebula as pending placement instead of silently disappearing. Treat this
  as a distinct status from `open_questions` — an open question is about the
  *content*, `needs_new_node` is about *where it lives*.

### Migration notes

- All new fields are nullable/optional with safe defaults (`design_rationale:
  []`, `type: "requirement"`, `needs_new_node: false`) so existing rows and
  any code reading them are untouched — consistent with expiring rather than
  rewriting.
- No backfill implied: existing filed candidates don't need `type` or
  `design_rationale` retrofitted. They're simply candidates from before this
  distinction existed.

---

### Notes on wiring this into the existing procedure

- Op A's output is worth persisting on its own, independent of filing — e.g.
  a `raw_candidates` field alongside `docklang` on the harvest record. That
  gives you an audit trail of what the extractor saw, and lets you re-run
  just Op B later (after a hierarchy change) without re-parsing or
  re-extracting.
- Op A needs no Nebula tool access at all — worth enforcing at the tool-
  binding level, not just in the prompt, so it can't reach for the hierarchy
  even if it tries.
- Op B's review checkpoint is a deliberate stop: draft mapping → your
  approval → then the `nebula_create_harvest_candidate` calls happen.
