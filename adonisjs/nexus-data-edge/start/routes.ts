/*
|--------------------------------------------------------------------------
| Data-plane edge — route table
|--------------------------------------------------------------------------
|
| One AdonisJS process hosting the canonical data-plane REST surfaces:
| nebula-srv, assembly-srv, conduit-srv, wind-srv, kernel-srv, peb-srv,
| cascade-srv (per binding ruling D-2026-08-14-002).
|
| Each domain registers its routes in a named group so the boot-time
| conformance validator can diff the route table against the emitted
| TypeSpec/OpenAPI contract (D-2026-08-14-004 Phase A).
|
*/

import router from '@adonisjs/core/services/router'

// ── Health ────────────────────────────────────────────────────────────
router.get('/health', [() => import('#controllers/health_controller'), 'index'])

// ── nebula-srv ────────────────────────────────────────────────────────
// Landed in Wave 3. Contract: typespec/v1/nebula-srv/ (to be modeled).
// router.group(() => {
//   router.get('/api/agent-records', [() => import('#controllers/nebula_controller'), 'listRecords'])
//   router.post('/api/agent-records', [() => import('#controllers/nebula_controller'), 'createRecord'])
//   router.get('/api/inbox-pointer/:role', [() => import('#controllers/nebula_controller'), 'getInboxPointer'])
// })

// ── assembly-srv ──────────────────────────────────────────────────────
// Landed in Wave 3. Contract: typespec/v1/assembly-srv/ (to be modeled).
// router.group(() => {
//   router.get('/api/forums', [() => import('#controllers/assembly_controller'), 'listForums'])
//   router.get('/api/forums/:slug/threads', [() => import('#controllers/assembly_controller'), 'listThreads'])
//   router.post('/api/forums/:slug/threads', [() => import('#controllers/assembly_controller'), 'createThread'])
// })

// ── conduit-srv ───────────────────────────────────────────────────────
// Landed in Wave 3. Contract: typespec/v1/conduit-srv/ (to be modeled).

// ── wind-srv ──────────────────────────────────────────────────────────
// Landed in Wave 3. Contract: typespec/v1/wind-srv/ (to be modeled).

// ── kernel-srv ────────────────────────────────────────────────────────
// Landed in Wave 3. Contract: typespec/v1/kernel-srv/ (to be modeled).

// ── peb-srv ───────────────────────────────────────────────────────────
// Landed in Wave 3. Contract: typespec/v1/peb-srv/ (to be modeled).

// ── cascade-srv ───────────────────────────────────────────────────────
// Landed in Wave 3. Contract: typespec/v1/cascade-srv/ (to be modeled).
