Use the Rover harvest pipeline at nexus/python/rover/ to process the next 5 largest and MOST RECENT unharvested chat HTMLs in ~/dev/chats/ that aren't already in the nebula.harvests database table (check with nebula_list_harvests first). For each transcript:

1. Convert HTML → markdown using Docling. In the rover venv (~/dev/nexus/python/rover/.venv), import and call convert_to_markdown(html_path) from harvest_pipeline.py. If Docling is unavailable, use pandoc --from html --to markdown as a fallback.

2. Chunk the markdown into pieces of ~40,000 characters with 4,000 character overlap. Use langchain_text_splitters.RecursiveCharacterTextSplitter from the rover venv, or split manually at paragraph boundaries if that's not available.

3. For each chunk, act as the inference engine yourself (don't call Ollama). Use the exact system prompt below and extract structured results matching this Pydantic schema:

SYSTEM PROMPT (use verbatim):
"""
You are an advanced Software Archaeologist and Technical Analyst. Your primary mission is to extract actionable engineering intent and harvest implementable code blocks from unstructured developer chat transcripts.

Follow these execution guidelines closely:

1. Exact Code Extraction: If a participant shares code, scripts, configurations, or schemas, extract it word-for-word. Never truncate code with placeholders like '// ... rest of code'.
2. Code Contextualization: Link the code to its corresponding "Specification Candidate." Do not leave code blocks floating without their intent explanation.
3. Code Version Tracking: If a code snippet is updated or refactored later in the chat, capture the final corrected version as the primary asset, and note the change in implementation notes.
4. Separate Discussion from Code: Ensure conversational text surrounding the code blocks remains in the intent descriptions, while code objects contain only valid, executable script syntax.
"""

OUTPUT SCHEMA — return a single JSON object matching this structure:
{
  "agenda_items": [
    {
      "title": "Action-oriented title for the requirement candidate",
      "status": "Proposed | Agreed | Superseded",
      "intent_description": "Business objective or core logic discussed",
      "requirements": ["bullet-point acceptance criteria"],
      "implementation_notes": ["technical infrastructure or architectural boundaries"],
      "code_snippets": [
        {
          "language": "python | typescript | bash | sql | etc.",
          "purpose": "Short sentence explaining what this code implements",
          "raw_code": "EXACT executable code, never truncated"
        }
      ],
      "open_questions": ["unresolved points or blockers"]
    }
  ]
}

For each chunk, send yourself the user message: "Analyze this chat log and harvest all architectural specifications and code blocks:\n\n{chunk_text}" and parse your own response as JSON matching the schema above. Use temperature ~0.1 for deterministic results.

1. Merge all agenda_items across chunks into a single combined array. Deduplicate by title similarity.

2. Insert into the database using the nebula_create_harvest MCP tool with these fields:
   - sourcePath: "chats/{Original HTML filename}"
   - sourceFilename: "{Original HTML filename}"
   - model: "YOUR_MODEL_NAME"  (use whatever model name you are, e.g. "Claude Opus 4" or "GPT-5")
   - totalCandidates: length of merged agenda_items
   - candidates: the merged agenda_items array
   - sourceText: the full combined markdown text (optional, include if you have it)
   - tags: ["harvest", "rover", "{slug-of-chat-name}", "{model-slug}"]
   - metadata: {"source_chat": "{chat title}", "total_chunks": N, "successful_chunks": N}

Process one transcript at a time and verify each insert with nebula_get_harvest before moving to the next.
That's the prompt. The agent needs nebula-mcp connected (port 3101) and the rover venv available for Docling + chunking. If Docling isn't installable in the other CLI's environment, the pandoc fallback handles it.
