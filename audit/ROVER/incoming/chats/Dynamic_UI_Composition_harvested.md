# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Dynamic UI Composition.html
**Model:** DeepSeek V4
**Total candidates:** 3
---
## 1. Lease as Entry Ritual — No Persistent Login, Only Lease Acquisition
**Status:** `Agreed`

### Architectural Intent
Replace the conventional login/auth model with a lease acquisition state machine. Login becomes a special case of lease acquisition — a state machine entry ritual, not a persistent gatekeeper screen. Flow: 'what do you want access to?' → lease issued → workspace appears. After onboarding, identity stops being a UI concern. This fits Nexus because roles are not static identities, workflows are not global, capabilities are not universal, and governance is per-artifact/per-task/per-session.

### Requirements & Acceptance Criteria
- [ ] No persistent login screen — login is a degenerate case of lease acquisition
- [ ] Onboarding flow: Intent discovery → Capability negotiation → Lease issuance
- [ ] After lease establishment, identity must not be a UI concern
- [ ] AG-UI sessions must represent the interactive expression of an active lease
- [ ] No lease → no meaningful actions; lease → full expressive UI stream

---

## 2. ViewSpec as Declarative Perception DSL — Apps Become Serialized Cognition State
**Status:** `Agreed`

### Architectural Intent
Define ViewSpec as a declarative DSL for composing perception over an operational substrate. A ViewSpec declares: panels (named perception slices), role bindings (what each panel observes), action surfaces (what operations are valid), and transition rules (how views morph/split/collapse). The key insight: UI is not authored — it is declared as a ViewSpec, and the Projection Engine renders it. Apps (Throttler, nexus-console, service-topology) become named ViewSpecs, not separate codebases. The lineage: Prism XML (early UI composition) → Throttler (operational workspace) → ViewSpec (semantic workspace definition) → AG-UI (streaming projection protocol).

### Requirements & Acceptance Criteria
- [ ] ViewSpec must declare: panels, role bindings, action surfaces, transition rules
- [ ] Projection Engine must render ViewSpecs into AG-UI streams
- [ ] ViewSpecs must support morphing, splitting, collapsing without 'navigation' as a concept
- [ ] Applications must be representable as named ViewSpecs, not separate codebases
- [ ] Must support workspace continuity — no UI boundary between tools

---

## 3. Workspace Reconstruction from ViewSpec — Enter Lease → Workspace Appears
**Status:** `Proposed`

### Architectural Intent
Implement workspace reconstruction: when a lease is activated with a ViewSpec reference, the Projection Engine reconstructs the entire workspace — panels, bindings, action surfaces, layout state — without navigation steps. The user doesn't 'open apps' — the system activates a ViewSpec and the workspace materializes. This collapses Throttler from an application into a saved panel arrangement that can be rehydrated on lease activation.

### Requirements & Acceptance Criteria
- [ ] Lease activation must accept an optional ViewSpec reference
- [ ] Projection Engine must reconstruct workspace from ViewSpec: panels, bindings, actions, layout
- [ ] Must support multiple named ViewSpecs: throttler, nexus-console, service-topology, roundtable-view, debug-receipts-view
- [ ] Workspace must be rehydratable — entering a lease reconstructs previous workspace state
- [ ] Navigation must not exist as a concept — only ViewSpec activation and transitions

---
