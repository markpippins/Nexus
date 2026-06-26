# Nebula Block Segmentation — Implementation Plan

> **Spec:** `nexus/angular/nebula-ui/SPEC-block-segmentation.md`
> **Harvest:** `5cf9d5c2` — "Nebula Block Segmentation"
> **Date:** 2026-06-26

---

## Phase 1: Database Migration

**Goal:** Create 5 new bitemporal tables in the `nebula` schema.

**Files to create:**
- `typescript/nebula-srv/migrations/003-block-segmentation.sql`

**Tables:**
1. `nebula.conversation_snapshots` → `_history` + view + triggers
2. `nebula.conversation_blocks` → `_history` + view + triggers
3. `nebula.segments` → `_history` + view + triggers
4. `nebula.harvest_references` → `_history` + view + triggers
5. `nebula.projection_overrides` → `_history` + view + triggers

**Indexes:**
- Partial indexes for active rows on every table (`WHERE expiration_dt = '9999-12-31'`)
- `content_hash` index on conversation_blocks for diffing
- `(snapshot_id, block_index)` composite on conversation_blocks
- `(snapshot_id, state, confidence)` on harvest_references
- `(snapshot_id, projection_target, target_type)` on projection_overrides
- Active-id uniqueness indexes (same pattern as scd-type4-temporal.sql)

**Dependencies:** None (greenfield tables)

**Verification:** Run `psql` against dev database, verify 5 new views appear in `nebula` schema.

---

## Phase 2: API Endpoints — nebula-srv

**Goal:** Add 11 REST endpoints for block segmentation.

**Files to modify:**
- `typescript/nebula-srv/src/routes.ts` — add new route handlers

**Files to create:**
- `typescript/nebula-srv/src/services/block-segmentation.service.ts` — business logic

**Endpoints:**
| Method | Path | Handler |
|---|---|---|
| `GET` | `/api/conversations/:id/snapshots` | List snapshots |
| `GET` | `/api/snapshots/:id/blocks` | List blocks (with `?diffFrom=` opt) |
| `POST` | `/api/snapshots` | Create snapshot |
| `POST` | `/api/segments` | Commit segment |
| `PATCH` | `/api/segments/:id` | Update segment |
| `DELETE` | `/api/segments/:id` | Supersede segment |
| `POST` | `/api/projection-overrides` | Add override |
| `DELETE` | `/api/projection-overrides/:id` | Remove override |
| `GET` | `/api/snapshots/:id/projection` | Get BP projection |
| `GET` | `/api/snapshots/:id/references` | Get references |

**Dependencies:** Phase 1 (tables must exist)

**Verification:** `curl` each endpoint against localhost, verify correct 200 responses.

---

## Phase 3: Redis Layer

**Goal:** Implement volatile session-memory caching for block segmentation.

**Files to create:**
- `typescript/nebula-srv/src/services/block-segmentation-redis.service.ts`

**Redis keys implemented:**
- `nebula:session:{conversation_id}` — session context
- `nebula:snapshot:{id}:block:{block_id}` — block metadata
- `nebula:snapshot:{id}:segment_candidates` — pending candidates
- `nebula:graph:{id}:out:{node_id}` / `in:{node_id}` — adjacency
- `nebula:snapshot:{id}:bp_projection` — cached projection

**Key behavior:** All Redis state is recomputable from Postgres. On cache miss or invalidation, rebuild from DB.

**Dependencies:** Phase 2 (API endpoints must exist, Redis populates on response)

**Verification:** Check Redis keys exist after API calls, verify recomputability.

---

## Phase 4: UI — BlockViewModel + State Machine

**Goal:** Implement the block-level interaction model in the nebula-ui harvest transcript viewer.

**Files to modify:**
- `angular/nebula-ui/src/models/data.models.ts` — add `BlockViewModel`, `NebulaUIEvent` types
- `angular/nebula-ui/src/services/data.service.ts` — add snapshot/block/segment/override API methods
- `angular/nebula-ui/src/components/harvest-view.component.ts` — add block segmentation state
- `angular/nebula-ui/src/components/harvest-view.component.html` — add START/END toggles per block

**State machine implementation:**
```
IDLE → START_SELECTED (on BLOCK_SEGMENT_START)
START_SELECTED → SEGMENT_READY (on BLOCK_SEGMENT_END)
START_SELECTED → IDLE (on BLOCK_SEGMENT_START re-click)
SEGMENT_READY → SEGMENT_COMMITTED (on SEGMENT_COMMIT)
SEGMENT_READY → IDLE (on cancel)
```

**Dependencies:** Phase 2 (API must be live for persistence)

**Verification:** Open transcript in nebula-ui, click START on a block, click END on another, confirm segment creation.

---

## Phase 5: UI — Visual States + Segment Rendering

**Goal:** Implement the 4 visual states and segment rendering.

**Files to modify:**
- `angular/nebula-ui/src/components/harvest-view.component.html` — visual state classes
- `angular/nebula-ui/src/components/harvest-view.component.ts` — computed visual state per block

**Visual states:**
| State | CSS class |
|---|---|
| Normal | `block-neutral` |
| In segment | `block-in-segment` (highlighted band) |
| BP suppressed | `block-suppressed` (opacity-50, grayscale) |
| Changed since snapshot | `block-changed` (border-l-2 border-amber-400) |

**Segment rendering:**
- Left rail bracket: `border-l-3 border-blue-400` on segment blocks
- Background band: `bg-blue-50/30` on in-segment blocks
- Label header: collapsible `div` above segment with editable title
- Collapsible: click header to toggle segment body visibility

**Dependencies:** Phase 4 (state machine must work)

**Verification:** Visual inspection — blocks inside a segment show blue highlight, suppressed blocks are faded.

---

## Phase 6: Integration + Polish

**Goal:** Wire UI ↔ API ↔ Redis ↔ Postgres end-to-end, add edge case handling.

**Tasks:**
- Loading states for segment commit / suppression toggle
- Error toasts on API failure
- Optimistic UI with rollback on failure
- Keyboard shortcuts (Esc to cancel segment, Enter to commit)
- Diff indicator: compare `content_hash` between current and previous snapshot
- Clean up `_find_harvest.py` and `_extract_schema.py` temp scripts

**Verification:** Full end-to-end test — harvest a conversation, open transcript, create a segment, suppress a block, verify BP projection excludes it, reload and verify persistence.

---

## Phase Dependency Graph

```
Phase 1 (DB Migration)
   ↓
Phase 2 (API Endpoints)
   ↓
Phase 3 (Redis) ← can run in parallel with Phase 4 once Phase 2 is done
   ↓
Phase 4 (UI: State Machine)
   ↓
Phase 5 (UI: Visual States)
   ↓
Phase 6 (Integration + Polish)
```

---

## Files Summary

| File | Phase | Action |
|---|---|---|
| `typescript/nebula-srv/migrations/003-block-segmentation.sql` | 1 | CREATE |
| `typescript/nebula-srv/src/services/block-segmentation.service.ts` | 2 | CREATE |
| `typescript/nebula-srv/src/services/block-segmentation-redis.service.ts` | 3 | CREATE |
| `typescript/nebula-srv/src/routes.ts` | 2 | MODIFY |
| `angular/nebula-ui/src/models/data.models.ts` | 4 | MODIFY |
| `angular/nebula-ui/src/services/data.service.ts` | 4 | MODIFY |
| `angular/nebula-ui/src/components/harvest-view.component.ts` | 4,5 | MODIFY |
| `angular/nebula-ui/src/components/harvest-view.component.html` | 4,5 | MODIFY |
