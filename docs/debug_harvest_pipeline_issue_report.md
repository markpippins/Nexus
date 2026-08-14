# Debug Harvest Pipeline: Transcript Chunks Start Mid-Conversation

**Report generated:** 2026-08-13  
**Owner:** Architect (role)  
**Source thread:** Debug harvest pipeline: transcript chunks start mid-conversation (To Do forum)

---

## TL;DR
- **Problem:** Raw transcript HTML (and downstream rover capture) often begins with the *assistant’s* reply mid-sentence, cutting off the opening user turn.  
- **Impact:** Blocks complete empty‑harvest operations because provenance (user→assistant→assistant…) is incomplete, preventing reliable candidate generation and later audit steps.  
- **Root causes identified:** (1) premature termination of the live‑DOM capture; (2) flawed prefix‑matching logic in the `_parse_claude_ai` parser; (3) missing completeness checks when building harvest candidates.  
- **Fix plan:** Enforce full‑page capture before HTML export; add explicit logging of dropped turns; enforce prefix‑matching on primary user utterances; guard candidate creation against truncated source transcripts; run a completeness‑check sampling after each harvest cycle.

---

## 1. Observed Issue (From the To‑Do thread)

- **HTML snippet:** 9 `data-message-author-role` elements; element 0 is an **assistant** turn that starts mid‑thought:  
  > “Yes. I think that is a very strong use of JSONB/text, because you are describing an observation…”
- **Dockling behavior:** Emits **9 discourse units** matching those elements, faithfully reproducing the truncated start.
- **Secondary parser (`_parse_claude_ai`):** Continues processing *any* article regardless of a proper “You said / Claude responded / …” prefix, silently renumbering turns from the first surviving unit.
- **Result:** Transcript representations start with a partial assistant reply, losing the original user opening.

---

## 2. Why It Matters

| Concern | Explanation |
|---------|-------------|
| **Provenance integrity** | Harvest → candidate → requirement linkage depends on an unbroken conversation sequence. If the first user utterance is missing, any downstream trace (e.g., `open_question_entities`, `requirement_id` mapping) is fundamentally broken. |
| **Empty‑harvest cleanup** | The planned bulk purge of `harvests`, `candidates`, `requirements`, and `implementation_plans` assumes each harvested artifact has a *complete* transcript provenance. Truncated transcripts make the provenance ambiguous, leaving stale data behind. |
| **Auditability** | The audit checklist demands that each harvested unit be traceable back to its originating message 1. Truncated transcripts violate that guarantee, creating an audit trail gap. |
| **Re‑harvest triggers** | Future re‑harvests will re‑process the same transcripts; without a fix the same mid‑conversation start will repeat, perpetuating the problem. |

---

## 3. Debugging Scope & Findings

### 3.1 Rover Capture (`rover` → HTML)
1. **Capture path:** `watch_transcripts.sh` → `rover/client` → `DOMSerializer.html()`  
2. **Suspected cause:** Live‑DOM virtualization – the browser’s virtual list only renders the visible viewport. If the capture script fires before the page finishes scrolling, only the visible window (often the middle of the conversation) is saved.  
3. **Verification needed:**  
   - Insert a pre‑capture `scrollTo(0,0)` and wait for `document.readyState === "complete"` before dumping HTML.  
   - Compare file size / element count against a known good, full‑load capture.

### 3.2 Dockling (`dockling.py`)
1. **Primary emitter:** `_parse_claude_ai` (lines 288‑322) parses the HTML and extracts `data-message-author-role` elements.  
2. **Current behavior:**  
   - Emits discourse units **exactly** as they appear; no sanity‑check on turn order.  
   - If the first element is an assistant turn (mid‑thought), the emitted unit list **starts** there, silently skipping any preceding user turn.  
3. **Missing safeguard:** No logging of dropped turns; the parser never records “*turn 1 was omitted*”.  

### 3.3 Substance Segment Backfill
- Builds segments from the **unit list** produced by dockling.  
- If the list is incomplete, segment boundaries are off; segment‑set metadata may reference non‑existent earlier turns.  

### 3.4 Harvest → Candidate Creation
- The **first candidate** of a harvest references the *source* transcript to establish provenance.  
- If the source is truncated, the candidate’s `source_path` points to an incomplete transcript, breaking the link to the true conversation start.  

### 3.5 Re‑Harvest Process
- After a fix, re‑harvest the affected set to verify that provenance now captures the full conversation opening.

---

## 4. Root‑Cause Hypotheses

| Hypothesis | Evidence | Likelihood |
|------------|----------|------------|
| **Premature Capture** – The `watch_transcripts.sh` script fires before the page fully loads, causing the DOM snapshot to miss the initial user turn(s). | - Observation of assistant‑only first element; HTML size is smaller than a full‑page capture. <br> - Virtualized list may render only a viewport subset. | **High** |
| **Parser Sloppiness** – `_parse_claude_ai` does not enforce a valid opening prefix; it silently accepts the first element regardless of role. | - Logs show continuation even when first element is an assistant turn. <br> - No “*turn 1 missing*” warning in logs. | **Medium** |
| **Silent Turn Dropping** – Dockling never records that a turn was omitted, leading downstream components to assume a full sequence. | - No audit‑level logging of dropped turns. | **Medium** |

---

## 5. Recommended Fixes (Prioritized)

| Step | Action | Owner | Target |
|------|--------|-------|--------|
| **1. Full‑Page Capture** | Modify `watch_transcripts.sh` (or equivalent) to: <br> a) Wait for `document.readyState === "complete"`; <br> b) Ensure viewport scrolls to top before dumping `innerHTML`. | Engineer (rover) | Immediate (next capture cycle) |
| **2. Turn‑Drop Logging** | Extend `_parse_claude_ai` to: <br> a) Track the index of the first emitted element; <br> b) Emit a warning (`logger.info("Dropped X leading turns")`) when the first element isn’t a user turn. | Engineer (dockling) | Immediate |
| **3. Enforce Primary‑User Prefix** | Require the first valid element to match a whitelist of *user* initiators (`You said`, `ChatGPT said`, `Assistant said`, etc.). Reject or truncate any harvest that does not start with such a prefix. | Engineer (harvest pipeline) | Next release |
| **4. Guard Candidate Creation** | In the harvest‑to‑candidate step, verify that the referenced transcript contains a *complete* opening (e.g., at least 3 consecutive human turns) before allowing candidate generation. | Engineer (harvest) | Next release |
| **5. Completeness‑Check Sampling** | After each harvest, sample N transcripts and validate that the first `data-message-author-role` element is a **user** turn. Fail the harvest if any sample violates this. | QA (automated job) | Ongoing |

---

## 6. Deliverables

1. **Patch to `watch_transcripts.sh`** – enforce full‑page capture.  
2. **Modified `_parse_claude_ai`** – add logging and prefix validation.  
3. **Update harvest candidate generation** – enforce complete opening rule.  
4. **Automated completeness‑check script** – sample & assert proper turn order post‑harvest.  
5. **Updated audit documentation** – reflect the new completeness requirement for harvested transcripts.  
6. **Re‑harvest of previously affected artifacts** – once fixes are deployed, re‑harvest the set identified as truncated (identified via the completeness‑check failures).  

All changes must be recorded in the relevant migration files (`*.sql` or `run-*.js`) and versioned under the appropriate conduit plan.

---

## 7. Next Steps

- **Deploy patches** to the capture and parsing pipeline.  
- **Run a completeness‑check** on a random 5 % sample of recent harvests to confirm the issue is resolved.  
- **Re‑harvest** any affected transcripts and verify that the first `data-message-author-role` element now belongs to a user turn.  
- **Update the To‑Do thread** with a brief status (“Issue resolved; completeness check passed on 2026‑08‑14”).  

---

### References

- **Source thread:** Debug harvest pipeline: transcript chunks start mid-conversation (To‑Do, ID `77494141-7fa`).  
- **Relevant code locations:** `rover/client/watch_transcripts.sh`, `dockling.py` (`_parse_claude_ai`), `harvest/service.py` (candidate creation), `substance/segment_builder.py`.  
- **Related tickets:** #T16 (runaway‑reviewer watchdog), #T15 (single scheduler evaluator) – both involve transcript completeness for downstream analytics.  

--- 

*Prepared by the Architect (role) for the Nexus repository.*