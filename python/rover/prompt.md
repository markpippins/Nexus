Use the Rover harvest pipeline at `nexus/python/rover/` to process unharvested chat HTMLs in `~/dev/chats/` that aren't already in the `nebula.harvests` database table (check with `nebula_list_harvests` first). For each transcript:

The pipeline now has two stages — a deterministic stage (Dockling) and an optional inference stage (filing):

---

## Stage 1 — Deterministic: Dockling → DockLang

Run Dockling on the HTML to produce structured DockLang (canonical conversation IR). This replaces Docling entirely.

```
cd /home/codex/dev/nexus/python/rover
source .venv/bin/activate
python3 /home/codex/dev/nexus/audit/ROVER/bin/dockling.py {html_path}
```

Dockling extracts the full conversation structure deterministically — no LLM needed:

- **Discourse Units** (one per message turn) with headings and provenance
- **Block types**: paragraph, code, diagram (ascii/mermaid), list, quote, separator
- **Code blocks** verbatim, with surrounding discussion preserved
- **Provenance** linking each block to its position in the conversation

Output is a `docklang/v0.3` JSON object with `discourse_units[]` and `stats`.

Write the docklang to `nebula.harvests.docklang` by including it as the `docklang` parameter when creating the harvest (the migration is already in place). Dockling is fast (~1-3s per file) and format-independent — it normalises any chat export into the same IR.

**Why deterministic matters**: Dockling preserves every code block, every ASCII/Mermaid diagram, every quote, and the surrounding discussion — none of which survive a Docling→Markdown→chunk→LLM extraction pipeline. The data loss that made DeepSeek's candidates haphazard is eliminated at this stage.

---

## Stage 2 — Inference: File Candidates into Nebula (Optional, Targeted)

LLM inference is no longer needed for parsing HTML or extracting candidates from raw chat text. The one place inference provides real value is **filing candidates into the Nebula hierarchy** — mapping extracted concepts to the right system, subsystem, or feature.

With DockLang providing full context (code blocks, diagrams, discussion), the inference has richer signals than DeepSeek had. Use it to:

1. From the docklang's `discourse_units[]`, identify candidate-worthy architectural concepts
2. Query the Nebula hierarchy via `nebula_list_systems`, `nebula_list_subsystems`, `nebula_list_features`
3. Match each candidate to the appropriate node in the hierarchy
4. Create the candidate via `nebula_create_harvest_candidate` with `system_id`, `subsystem_id`, `feature_id` linked

The schema for each candidate:

```json
{
  "title": "Action-oriented title for the requirement candidate",
  "status": "Proposed | Agreed | Superseded",
  "intent_description": "Business objective or core logic discussed",
  "requirements": ["bullet-point acceptance criteria"],
  "implementation_notes": ["technical infrastructure or architectural boundaries"],
  "code_snippets": [
    {"language": "python | typescript | bash | sql | etc.",
     "purpose": "Short sentence explaining what this code implements",
     "raw_code": "EXACT executable code, never truncated"}
  ],
  "open_questions": ["unresolved points or blockers"]
}
```

Reference specific blocks from the docklang by their `provenance.block_index` to ground each candidate in the conversation.

---

## Procedure

For each transcript:

1. **Run Dockling** on the HTML — capture the docklang JSON output
2. **Create the harvest record** via `nebula_create_harvest`:
   - `sourcePath`: `"chats/{Original HTML filename}"`
   - `sourceFilename`: `"{Original HTML filename}"`
   - `model`: `"dockling"` (deterministic stage)
   - `totalCandidates`: 0 (or length of inferred candidates)
   - `candidates`: [] (or inferred candidates array)
   - `tags`: `["harvest", "rover", "{slug-of-chat-name}", "dockling"]`
   - `metadata`: `{"dockling_version": "v0.3"}`
   - `docklang`: the full docklang JSON object
3. **Optionally file candidates** via `nebula_create_harvest_candidate` with proper hierarchy links
4. **Create cross-references** linking the harvest to relevant knowledge entities via `nebula_create_cross_reference`

Process one transcript at a time and verify each insert with `nebula_get_harvest` before moving to the next.
