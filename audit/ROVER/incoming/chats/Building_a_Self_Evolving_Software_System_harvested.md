# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Building a Self-Evolving Software System.html
**Model:** DeepSeek V4
**Total candidates:** 9
---
## 1. Organizational Compiler Architecture — Incubating Subsystems from Conversational Intent
**Status:** `Proposed`

### Architectural Intent
Design a system that acts as a compiler for organizations: using natural language conversation to detect, formalize, and implement subsystems through a re-entrant, contract-driven workflow. A subsystem can be born from any input (Slack thread, meeting transcript, legal review, compliance question, brainstorm) — the system doesn't care where the idea comes from, only whether it has stable entities, operations, constraints, intent, stakeholders, and blockers. This collapses all metadata-collection tools (Confluence, Jira, Slack, email, network drives, Word docs, Excel spreadsheets) into a single cognitive substrate that also acts as a CI/CD orchestration tool.

### Requirements & Acceptance Criteria
- [ ] Subsystem incubation pipeline: Detection → Reverse Extraction → Formalization → Refinement → Implementation → Deployment Decision
- [ ] System must detect latent subsystems when entities, operations, constraints, intent, stakeholders, and blockers stabilize
- [ ] Every subsystem follows the same fixed but re-entrant internal workflow regardless of origin
- [ ] Ballerina at edges to eliminate orchestration layers (Rancher, Portainer, YAML sprawl)
- [ ] Jenkins stays as execution engine; everything else from ideation to deployment is handled by the organism

### Unresolved Follow-Ups
- What are the exact stability criteria for each of the six subsystem signals (entities, operations, constraints, intent, stakeholders, blockers)?
- How does the system handle subsystems that partially stabilize — some signals met, others not?

---

## 2. Continuous Cognition with Mute — Ambient Listening with Human-Controlled Scoping
**Status:** `Agreed`

### Architectural Intent
The system listens continuously (ambient cognition) but users can mute threads, channels, messages, meetings, or documents. Mute is a semantic boundary marker — the equivalent of .gitignore, // @ts-ignore, or exclude: in a build config. Muted content is treated as non-existent for ontology building, subsystem emergence, dependency analysis, and predictive warnings. Re-entrancy is preserved: a muted thread can later be unmuted, and the system replays the conversation retroactively. This keeps the organism socially acceptable — a coworker who knows when to step back.

### Requirements & Acceptance Criteria
- [ ] Users must be able to mute threads, channels, messages, meetings, documents
- [ ] Muted content must be treated as non-existent for all system processing
- [ ] Re-entrant unmute: system replays conversation and extracts ontology retroactively
- [ ] Mute must be explicit (user-controlled), not implicit (system-guessed)
- [ ] The system must never surface muted content in any form

### Unresolved Follow-Ups
- Should mute apply to specific users or globally across the organization?
- How are mute boundaries enforced across different views/projections of the same content?

---

## 3. Semantic Ignore-List — Preconfigured Filter for Non-Organizational Content
**Status:** `Agreed`

### Architectural Intent
Define a preconfigured ignore-list that filters personal life, emotional venting, jokes, gossip, small talk, family logistics, sports chatter, and anything not related to work intent BEFORE the system considers whether to signal or extract notes. This prevents the organism from creating entities like Wife, Jimmy, BaseballPractice, generating false subsystem detections, or misinterpreting emotional tone as risk. 'I got into an argument with my wife about who has to take Jimmy to baseball practice' should NOT result in a meeting scheduling request. The ignore-list is long, opinionated, and evolves over time.

### Requirements & Acceptance Criteria
- [ ] Ignore-list must run before Step 0 of the processing pipeline (pre-parse filter)
- [ ] Must cover: personal life (spouses, kids, pets, errands), emotional content (venting, frustration, conflict), social chatter (sports, movies, memes), non-work logistics (car repairs, home maintenance, school events)
- [ ] Filtered content must never be highlighted, never become a note event, never enter organizational memory
- [ ] The ignore-list must be tunable — default long list that can be adjusted per organization
- [ ] The avatar must never show signals (eyebrows/question marks) for ignored content

### Harvested Code Artifacts
#### Purpose: Processing pipeline with ignore-list gate
```text
Pipeline:
1. Message arrives
2. Ignore-list filter runs → personal/irrelevant = DISCARD
3. If work-related → analyze
4. Highlight relevant segments
5. Avatar signals if needed
6. User can adjust boundaries
7. System commits note event
```

### Unresolved Follow-Ups
- Should the ignore-list be static or adaptive (learning what each organization considers noise)?
- How is the boundary between 'personal gripe about work situation' and 'actionable blocker' determined?

---

## 4. Post-It Note Color UI — Real-Time Live AST Viewer for Conversational Intent
**Status:** `Proposed`

### Architectural Intent
Design a UI where the system highlights text segments that will become note events using post-it note background colors. Blue = engineering/technical, Pink = scheduling/calendar, Yellow = compliance/legal, Green = finance/budget, Purple = HR/personnel, Orange = risk/blockers, Gray = informational/low-priority. Highlights appear one to two lines above the current cursor position to avoid distracting the user. This is the live parse tree of the conversation — the system saying 'Here's what I think matters. Do you want to adjust it before I commit it to the organizational memory?' Combined with the avatar's eyes/signals, this creates a dual-channel cognitive UI.

### Requirements & Acceptance Criteria
- [ ] Highlights must appear 1-2 lines above current cursor to not distract
- [ ] Colors must map to substrate categories: Blue (engineering), Pink (scheduling), Yellow (compliance), Green (finance), Purple (HR), Orange (risk), Gray (informational)
- [ ] Users must be able to adjust highlight boundaries (expand/shrink/merge/split)
- [ ] Hover behavior must allow reclassification of the semantic category
- [ ] Highlights must be subtle — soft background color, no layout shift
- [ ] Color mapping must be customizable per user and per organization

### Unresolved Follow-Ups
- Should highlights be subtle (soft glow) or explicit (bold background) by default?
- How are colorblind-safe palettes provided?

---

## 5. Dual-Layer Ontology Weighting — Local Corrections vs Global Consensus
**Status:** `Proposed`

### Architectural Intent
Define a two-layer weighting model for the ontology. Layer 1 (per-user corrections): each user's reclassifications are stored as personal preferences — one user always escalating outages to management is their style, not a global rule. Layer 2 (cross-user consensus): when multiple users reclassify the same pattern, the global weight increases. The rule: a single correction is a hint; multiple corrections across users is a rule. Example: 'wire service down again' might be engineering (blue) for one org, vendor escalation (orange) for another, or personal gripe (gray) in an org with scheduled resilience testing. The system must also consider contextual cues (scheduled outages, no one else reacting, no escalation following) to down-weight significance.

### Requirements & Acceptance Criteria
- [ ] Layer 1: per-user corrections stored as local weights — no global effect from single-user changes
- [ ] Layer 2: cross-user consensus — when N different users reclassify the same pattern, global weight increases
- [ ] Threshold: single correction = hint, N corrections = rule (N configurable, suggested default 4)
- [ ] Contextual cues must down-weight: scheduled events, lack of follow-up, no stakeholder engagement
- [ ] System must never store interpersonal reasons — only structural effects (e.g., 'approval likelihood low' not 'Ted is blocking')

### Unresolved Follow-Ups
- What is the exact threshold function — linear, sigmoid, or step-based?
- How are conflicting global weights resolved when different subgroups have different norms?

---

## 6. Intent Decay — Weights Fade Over Time Unless Reinforced
**Status:** `Agreed`

### Architectural Intent
Ontology weights must decay over time when unreinforced. A spitballing session might hit all the precedents for building a new system, but the idea could die out in unrecorded verbal exchanges. Unmentioned for weeks or months indicates a lack of intent — the inverse corollary to intent snowballing with joined conversations, fleshed-out data models, stakeholder buy-in, and scheduled meetings. Decay must be gradual, non-linear (first week matters more than tenth), context-aware (quarterly cycles slow decay), reinforcement-sensitive (one mention slows decay but doesn't fully restore), and multi-layered (applies to entities, operations, constraints, transitions, blockers, stakeholders, artifacts). This prevents the system from becoming a museum of abandoned ideas.

### Requirements & Acceptance Criteria
- [ ] Decay must be time-based: weights fade over days/weeks/months of silence
- [ ] Decay must be non-linear: first week of silence matters more than the tenth
- [ ] Decay must be context-aware: quarterly cycle items decay slower
- [ ] Reinforcement must slow decay but not fully restore — one mention after long silence is not full resurrection
- [ ] Decay must apply to all substrate elements: entities, operations, constraints, transitions, blockers, stakeholders, artifacts
- [ ] The system must stop proposing next steps for decayed initiatives (silent background strategist mode)

### Unresolved Follow-Ups
- Should decay be uniform across categories or category-specific (engineering decays slower than HR, compliance slower than brainstorms)?
- What is the exact decay curve — exponential, linear, or custom?

---

## 7. Culture-Aware Decay — Model Effects, Not Dynamics
**Status:** `Agreed`

### Architectural Intent
The system must model organizational effects without storing interpersonal dynamics. It must never store 'Ted is blocking this' — instead it stores 'approval likelihood is low, stakeholder alignment is low, this initiative lacks executive sponsorship.' Cultural blockers decay rapidly unless reinforced, and are treated as soft knowledge (ephemeral, contextual, not part of formal ontology). The system adjusts predictions without surfacing causes: stops proposing next steps for politically blocked initiatives without saying why. This keeps the system trusted, safe, neutral, and professional — it models organizational physics, not organizational psychology.

### Requirements & Acceptance Criteria
- [ ] System must never store interpersonal reasons ('Ted is blocking', 'VP hates this idea') — only structural effects ('approval likelihood low', 'stakeholder alignment low')
- [ ] Cultural blockers must decay faster than structural blockers
- [ ] Cultural blockers must never be surfaced in formal artifacts, reports, or to other users
- [ ] System must adjust behavior silently: stop proposing, stop generating artifacts, stop escalating — without explaining why
- [ ] The system must model outcomes, not motives — what is happening, not why humans feel the way they do

### Unresolved Follow-Ups
- How does the system detect that a blocker is cultural vs structural without being told explicitly?
- What happens when a cultural blocker persists for years — does it eventually become a structural fact?

---

## 8. TypeSpec + TLA+ + CUE Compiler Pipeline — Cognitive Exoskeleton for Solo Development
**Status:** `Proposed`

### Architectural Intent
Integrate TypeSpec, TLA+, and CUE as three layers of a compiler pipeline that form a cognitive exoskeleton. TypeSpec is the contract layer — the single source of truth for interfaces, data models, namespaces, and versioning. TLA+ is the invariant layer — it checks distributed coordination, state transitions, concurrency, ordering, idempotency, safety, and liveness for the dangerous parts. CUE is the configuration compiler — it takes TypeSpec outputs + TLA+ invariants + deployment rules + environment constraints and generates Kubernetes manifests, Ballerina configs, JSON schemas, and CI/CD configs. The pipeline: Natural Language Intent → TypeSpec (structure) → TLA+ (invariants) → CUE (configuration) → Generated Artifacts → Running System.

### Requirements & Acceptance Criteria
- [ ] TypeSpec must be the canonical contract layer: APIs, models, namespaces, versioning
- [ ] TLA+ must verify distributed coordination, state transitions, concurrency, ordering, safety, and liveness
- [ ] CUE must generate Kubernetes manifests, Ballerina configs, JSON schemas, validation rules
- [ ] Pipeline must be deterministic: same TypeSpec + TLA+ → same CUE → same artifacts
- [ ] The developer only reviews TypeSpec, TLA+, and CUE — everything else is generated, validated, drift-checked, self-correcting

### Harvested Code Artifacts
#### Purpose: Integrated compiler pipeline
```text
Natural Language Intent
        ↓
TypeSpec (structure — contracts, models, namespaces)
        ↓
TLA+ (invariants — safety, liveness, concurrency)
        ↓
CUE (configuration — manifests, schemas, validation)
        ↓
Generated Artifacts (OpenAPI, SDKs, stubs, configs)
        ↓
Running System
```

### Unresolved Follow-Ups
- Can TLA+ invariants be auto-generated from TypeSpec contracts, or must they be hand-authored?
- How does CUE handle environment-specific overrides without drift from the canonical TypeSpec?

---

## 9. TypeSpec-Driven Drift Scanner + CUE Validator — Minimum Viable Compiler Piece
**Status:** `Proposed`

### Architectural Intent
Build the smallest useful piece of the compiler in 1-3 days: a TypeSpec-driven drift scanner + CUE validator. The tool loads TypeSpec contracts, scans a module's code (Java, TS, Python), extracts actual endpoints, compares them to the contract, outputs a drift report in the ontology format, and validates the report using CUE. This gives the core loop: Scan → Detect → Represent → Act. It provides immediate visibility into drift, contract coverage, change detection, and a machine-readable IR that LLMs can consume.

### Requirements & Acceptance Criteria
- [ ] Load TypeSpec contracts via tsp compile output (OpenAPI or JSON emitter)
- [ ] Scan code for one language: extract HTTP method, path, operation name, request model, response model
- [ ] Compare expected vs actual: detect missing endpoints, extra endpoints, signature mismatches, model mismatches, method mismatches, path mismatches
- [ ] Output ModuleScanReport JSON in existing ontology format
- [ ] Validate output with CUE: cue vet drift.json ontology.cue
- [ ] Tool must be CLI-runnable and CI-integrable

### Unresolved Follow-Ups
- Which language should the first scanner target — Java (main codebase) or TypeScript (conduit-mcp)?
- Should the drift report include suggested remediation actions or just detection?

---
