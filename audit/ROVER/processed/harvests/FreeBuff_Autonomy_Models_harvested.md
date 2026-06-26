# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/FreeBuff Autonomy Models.html
**Model:** DeepSeek V4
**Total candidates:** 6
---
## 1. FreeBuff as Event-Interpreting Cognitive Agent — Not a Task Worker
**Status:** `Agreed`

### Architectural Intent
Redefine FreeBuff from a polling task worker into a resident event-interpreting cognitive agent. The core shift: events are first-class cognitive objects, agents are reactive interpreters, and 'work' is an interpretation outcome not an assignment. FreeBuff subscribes to serialized events carrying full WorkRequest IR, KG diffs, capability hints, provenance chains, confidence scores, and policy tags. It classifies events into {drop | absorb | execute | escalate} based on capability + policy matching.

### Requirements & Acceptance Criteria
- [ ] FreeBuff must interpret typed event streams under a capability + policy model, never consume events blindly
- [ ] Serialized events must carry: type, payload (WorkRequest IR, KG diff), semantics (mode, mutability, source)
- [ ] Classification step: drop | absorb | execute | escalate — explicit decision gate before any MCP tool execution
- [ ] Work becomes an interpretation outcome, not an assignment from a task queue

---

## 2. Resident FreeBuff Daemon — Persistent NATS Subscription + Async Event Loop
**Status:** `Proposed`

### Architectural Intent
Build a FreeBuff Runtime Process that maintains a persistent NATS connection, an async event loop, in-memory state cache, MCP client bridge, and execution queue. This replaces the current ephemeral subscription model (spawn agent → connect → subscribe → sleep window → dump results → exit) with a long-lived event reactor. The core loop: event ingestion → state update → policy evaluation → action. Decouple event ingestion, decisioning, and execution into separate async stages.

### Requirements & Acceptance Criteria
- [ ] Persistent NATS connection with pattern-based subscriptions (nexus.cascade.v1.>, etc.)
- [ ] Async event loop with callback-based handlers
- [ ] In-memory state cache for event projection
- [ ] MCP client bridge for tool execution
- [ ] Execution queue decoupled from event ingestion
- [ ] Must move from event→action to event→state_update→policy_evaluation→action

---

## 3. Agent Runtime as Lease-Governed Activation Layer — Promptable Agent Sessions
**Status:** `Proposed`

### Architectural Intent
Define the Agent Runtime as the layer that owns agent lifecycles, session management, and work claiming — separate from MCP (tool access) and MessageBox (event transport). When an event arrives, the Runtime launches a FreeBuff session with a structured prompt ('New work available') rather than FreeBuff polling. The Runtime becomes: Conduit/Vector/MessageBox depending on where lifecycle responsibility ultimately lands. This completes the separation: Runtime = agent activation, MCP = knowledge access, MessageBox = event transport.

### Requirements & Acceptance Criteria
- [ ] Agent Runtime must own: agent lifecycle, session management, work claiming
- [ ] MCP must remain purely tool access — never wake agents
- [ ] MessageBox must remain purely event transport — never own agent state
- [ ] Events must compile into structured prompts before agent sessions launch
- [ ] Runtime must support promptable agent sessions triggered by event arrival

---

## 4. Lease Lifecycle System — Onboarding as Degenerate First Step of Lease Acquisition
**Status:** `Proposed`

### Architectural Intent
Replace the conventional login/auth system with a Lease Lifecycle System where onboarding is just the degenerate first step. Instead of login screen → app, the flow becomes: intent discovery → capability negotiation → lease issuance → workspace appears. Identity stops being a UI concern after lease establishment — roles are not static identities, workflows are not global, capabilities are not universal, governance is per-artifact/per-task/per-session. AG-UI becomes 'the interactive expression of an active lease' rather than a frontend protocol.

### Requirements & Acceptance Criteria
- [ ] Lease must be ServiceBroker-issued context boundary
- [ ] No persistent login screen — onboarding is a state machine entry ritual
- [ ] AG-UI sessions must be bounded by active lease scope
- [ ] No lease → no meaningful actions; lease → full expressive UI stream
- [ ] ServiceBroker records all lease-gated interactions — nothing escapes the ledger

---

## 5. Throttler as Saved ViewSpec — Applications Become Stable Projections
**Status:** `Proposed`

### Architectural Intent
Collapse Throttler from a standalone application into a saved ViewSpec — a named projection of a ViewSpec state graph. Opening Throttler becomes: activate ViewSpec(throttler). This removes 'applications as destinations' and replaces it with 'applications as stable projections.' Throttler, nexus-console, service-topology, roundtable-view, debug-receipts-view all become different ViewSpecs over the same operational substrate. UI becomes serialized cognition state — apps become things you declare, not things you build.

### Requirements & Acceptance Criteria
- [ ] Throttler must be representable as a ViewSpec YAML/JSON: panels (queue-stream, rate-controls, service-activity, audit-receipts), bindings (nats.events, servicebroker.requests)
- [ ] ViewSpec activation must reconstruct workspace without navigation
- [ ] No UI boundary between tools — only workspace continuity
- [ ] ViewSpecs must support morphing/splitting/collapsing without 'navigation' as a concept

---

## 6. Work Context IR — Bounded Semantic Grounding for Task Handoff
**Status:** `Proposed`

### Architectural Intent
Define a Work Context IR schema emitted with every Nebula Backlog→ToDo transition to solve two problems: (1) granularity drift where DeepSeek file crawling over-expands or under-expands requirements, and (2) spec/doc invisibility where local documentation is discoverable but not semantically anchored into the task's reasoning frame. The IR must contain: scope envelope (resolution, bounded flag, expansion_allowed), required context projection (explicit file paths, role signals, interpretation_mode), and role cue injection (primary/secondary reasoning roles).

### Requirements & Acceptance Criteria
- [ ] Scope envelope: resolution (feature|module|refactor|system), bounded flag, expansion_allowed flag
- [ ] Required context projection: required_files list, role_signals list, interpretation_mode (spec-grounded|exploratory|maintenance)
- [ ] Role cue injection: primary and secondary reasoning roles
- [ ] Must prevent models from deciding scope or relevant context implicitly
- [ ] Must be emitted as part of every Backlog→ToDo state transition in Nebula

---
