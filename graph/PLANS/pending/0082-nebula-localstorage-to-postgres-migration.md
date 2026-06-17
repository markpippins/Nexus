---
project: nebula-ui
dependencies: []
acceptance:
  - ls /home/codex/dev/nexus/angular/nebula-ui/src/services/data.service.ts
  - ls /home/codex/dev/nexus/typescript/nebula-srv/src/routes.ts
  - ls /home/codex/dev/nexus/typescript/nebula-srv/src/index.ts
  - cd /home/codex/dev/nexus/angular/nebula-ui && npx tsc --noEmit 2>&1 || true
  - cd /home/codex/dev/nexus/typescript/nebula-srv && npx tsc --noEmit 2>&1 || true
---

# Plan 0082: Nebula localStorage-to-PostgreSQL Full Migration

**Goal:** Eliminate ALL browser localStorage metadata storage in the Nebula
RMS and pipeline UI ecosystem. Move every category of metadata currently
persisted to the browser's localStorage into the PostgreSQL `nebula` database,
served through the `nebula-srv` Express API. Ensure zero data loss for existing
users via an automatic migration path on first load.

**Status:** PLAN — ready for builder pickup

---

## Context: What's In The Nebula DB Today vs What's In Browser localStorage

### Already In PostgreSQL (`nebula` schema, served by `nebula-srv` on :3101)

| Table | What It Tracks | Current Status |
|-------|---------------|----------------|
| `systems` | Top-level project containers | Schema exists; seeded via tests |
| `subsystems` | Child containers under systems | Schema exists |
| `features` | Leaf nodes under subsystems | Schema exists |
| `requirements` | Task/requirement items | Schema exists |
| `system_folders` | Hierarchical folders within systems | Schema exists |
| `work_sessions` | AI chat session records | Schema exists |
| `color_palette` | Auto-assigned subsystem colors | Schema exists |
| `system_workspaces` | Workspace path mappings | Schema exists |

**Reality check:** The schema is defined in `nexus/tests/nebula/schema.sql` and
`nexus/typescript/nebula-srv/src/routes.ts` already implements CRUD endpoints
for these tables. However, the **Angular nebula-ui frontend does NOT use the
API** — it exclusively reads/writes `localStorage`.

### Currently In Browser localStorage (NOT In Database)

#### Nebula RMS (nexus/angular/nebula-ui)

| localStorage Key | Contents | Service |
|-----------------|----------|---------|
| `nebula_systems` | Full nested hierarchy: System[] with subsystems and features inlined | `data.service.ts` |
| `nebula_requirements` | Requirement[] array | `data.service.ts` |
| `nebula_sessions` | WorkSession[] array | `data.service.ts` |
| `nebula_dark_mode` | Boolean theme preference | `data.service.ts` |
| `nebula_sidebar_width` | Number (pixels) | `app.component.ts` |
| `nebula_info_<systemId>_<tabId>` | Per-system info tab content (specification, reference-guide, dependencies, etc.) | `system-info.component.ts` |

#### Conduit UI (nexus/angular/conduit-ui)

| localStorage Key | Contents | Service |
|-----------------|----------|---------|
| `conduit-theme` (STORAGE_KEY) | Dark/light theme preference | `theme.service.ts` |
| `ai-config-log` (LS_LOG_KEY) | AI configuration log/debug data | `ai-config.service.ts` |
| `split-ratio` (SPLIT_STORAGE_KEY) | Split panel ratio | `sessions.component.ts` |

#### Nexus Console (nexus/angular/nexus-console)

| localStorage Key | Contents | Service |
|-----------------|----------|---------|
| `local-config` | Local configuration data | `local-config.service.ts` |
| `ui-preferences` | UI preferences object | `ui-preferences.service.ts` |
| `bookmarks` | Array of bookmarks | `bookmark.service.ts` |
| `session-fs` | In-memory file system tree (can be large) | `in-memory-file-system.service.ts` |
| `broker-profiles` | Legacy broker profiles (one-time migration source) | `broker-profile.service.ts` |
| `active-profile-id` | Currently selected broker profile | `broker-profile.service.ts` |

---

## What Markdown Metadata Files Are NOT In Nebula DB

These are metadata stores that live as markdown files on the filesystem,
separate from the nebula PostgreSQL database:

| Location | Contents | Count |
|----------|----------|-------|
| `.codex/PROMPTS/` | Codex prompt audit trail | ~14 files |
| `.codex/RESPONSES/` | Codex response audit trail | ~9 files |
| `.conduit-data/PROMPTS/` | Conduit prompt records | varies |
| `.conduit-data/IMPLEMENTATION_PLANS/pending/` | Pending pipeline plans | 16 files |
| `.conduit-data/IMPLEMENTATION_PLANS/proposed/` | Proposed pipeline plans | 1 file |
| `.conduit-data/IMPLEMENTATION_PLANS/planning/` | Planning phase plans | varies |
| `.conduit-data/IMPLEMENTATION_PLANS/completed/` | Completed plans | varies |
| `.conduit-data/CHANGES/` | Builder change reports | varies |
| `.conduit-data/INSPECTIONS/` | Inspector reports | varies |
| `.conduit-data/ANALYSIS/` | Analyst reports | varies |
| `.conduit-data/REQUIREMENTS/` | Requirements docs | varies |
| `.conduit-data/WORK_REQUESTS/` | Work request records | varies |
| `.conduit-data/SESSION.md` | Current pipeline session state | 1 file |
| `/home/codex/dev/nexus/.conduit-data/PLANS/` | New top-level plans dir | just created |

**Note:** These markdown files ARE tracked by the Conduit MCP server's
`pipeline.db` (SQLite), which maintains plan status, tickets, and receipts.
They are NOT in the nebula PostgreSQL DB. Moving these to a unified PostgreSQL
store is a separate concern, scoped in Plan 0083.

---

## The Plan: Migrate ALL Browser localStorage to PostgreSQL

### Scope

This plan covers the **nebula-ui RMS application** (`nexus/angular/nebula-ui/`).
The conduit-ui and nexus-console apps are out of scope for this plan but noted
for future work.

### Reference Materials

- **Existing detailed design:** `nexus/angular/nebula-ui/POSTGRES_CONVERSION.md`
- **Schema:** `nexus/tests/nebula/schema.sql`
- **API server:** `nexus/typescript/nebula-srv/src/routes.ts` (already has CRUD endpoints)
- **Frontend data service:** `nexus/angular/nebula-ui/src/services/data.service.ts`

---

## Phase 1: Database Schema Audit & Gap Analysis

### 1.1 Compare TypeScript Models → PostgreSQL Schema

The nebula-ui TypeScript models (`data.models.ts`) define these types:

```typescript
System    { id, name, description, readme?, createdAt,
            folders[], subsystems[] }
Subsystem { id, systemId, name, description, readme?,
            features[], color, createdAt }
Feature   { id, subsystemId, name, description, readme?, createdAt }
Requirement { id, systemId, subsystemId, featureId?, title,
              description, status, priority, startDate?,
              completionDate?, createdAt, updatedAt }
WorkSession { id, parentId, parentType, parentName, context,
              platform, model, messageCount?, createdAt }
```

**Gap analysis against `tests/nebula/schema.sql`:**

| TypeScript Field | PostgreSQL Column | Status |
|-----------------|-------------------|--------|
| System.readme | Missing | GAP — needs ALTER TABLE |
| System.folders[] | `system_folders` table | OK (separate table) |
| System.createdAt (epoch ms) | `created_at` (TIMESTAMPTZ) | TYPE MISMATCH |
| Subsystem.readme | Missing | GAP |
| Subsystem.createdAt (epoch ms) | `created_at` (TIMESTAMPTZ) | TYPE MISMATCH |
| Feature.readme | Missing | GAP |
| Feature.createdAt (epoch ms) | Not in schema | GAP |
| Requirement.priority values | CHECK uses different values | MISMATCH (see below) |
| Requirement.startDate | Not in schema | GAP |
| Requirement.completionDate | Not in schema | GAP |
| WorkSession.messageCount | Not in schema | GAP |
| WorkSession.createdAt | `created_at` exists | TYPE MISMATCH |

**Priority value mismatch:**
- TypeScript: `'Low' | 'Medium' | 'High'` (also allows `'Critical'`)
- PostgreSQL CHECK: `status IN ('Backlog','ToDo','InProgress','Done')`
- **Fix:** Align schema to match the TypeScript model, or vice versa.

### 1.2 Add Missing Columns

**Files affected:**
- **MODIFY:** `nexus/tests/nebula/schema.sql`
- **MODIFY:** `nexus/typescript/nebula-srv/src/routes.ts`
- **NEW (if needed):** Migration SQL script

**Actions:**
1. Add `readme TEXT` to `systems`, `subsystems`, `features` tables
2. Add `created_at TIMESTAMPTZ DEFAULT NOW()` to `features` table
3. Align `requirements.priority` CHECK to match TypeScript: `CHECK(priority IN ('Low','Medium','High','Critical'))`
4. Add `requirements.start_date TEXT` and `requirements.completion_date TEXT`
5. Add `work_sessions.message_count INTEGER DEFAULT 0`
6. Add an `updated_at` trigger to ALL tables (currently only on requirements and work_sessions)
7. Run migration: `psql -d nebula -f <migration>.sql`

### 1.3 New Tables for Non-RMS localStorage Data

| Table | localStorage Key | Schema |
|-------|-----------------|--------|
| `user_preferences` | `nebula_dark_mode`, `nebula_sidebar_width` | `user_id TEXT, key TEXT, value JSONB, PRIMARY KEY (user_id, key)` |
| `system_info_tabs` | `nebula_info_*` | `system_id UUID REFERENCES systems(id), tab_id TEXT, content TEXT, updated_at TIMESTAMPTZ, PRIMARY KEY (system_id, tab_id)` |

**Actions:**
1. Create `user_preferences` table:
   ```sql
   CREATE TABLE nebula.user_preferences (
       user_id  TEXT NOT NULL DEFAULT 'default',
       key      TEXT NOT NULL,
       value    JSONB NOT NULL DEFAULT '{}',
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (user_id, key)
   );
   ```
2. Create `system_info_tabs` table:
   ```sql
   CREATE TABLE nebula.system_info_tabs (
       system_id UUID NOT NULL REFERENCES nebula.systems(id) ON DELETE CASCADE,
       tab_id    TEXT NOT NULL,
       content   TEXT NOT NULL DEFAULT '',
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (system_id, tab_id)
   );
   ```

---

## Phase 2: API Server Enhancement

**Working directory:** `/home/codex/dev/nexus/typescript/nebula-srv/`

### 2.1 Add User Preferences Endpoints

**Files affected:**
- **MODIFY:** `src/routes.ts`

```typescript
// GET /api/preferences — get all preferences for a user
app.get('/api/preferences', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT key, value FROM nebula.user_preferences WHERE user_id = $1',
    ['default']
  );
  const prefs: Record<string, any> = {};
  rows.forEach(r => { prefs[r.key] = r.value; });
  res.json(prefs);
});

// PUT /api/preferences/:key — set a single preference
app.put('/api/preferences/:key', async (req, res) => {
  const { value } = req.body;
  await pool.query(
    `INSERT INTO nebula.user_preferences (user_id, key, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
    ['default', req.params.key, JSON.stringify(value)]
  );
  res.json({ ok: true });
});
```

### 2.2 Add System Info Tabs Endpoints

```typescript
// GET /api/systems/:id/info — get all info tabs for a system
app.get('/api/systems/:id/info', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT tab_id, content FROM nebula.system_info_tabs WHERE system_id = $1',
    [req.params.id]
  );
  res.json(rows);
});

// PUT /api/systems/:id/info/:tabId — save an info tab
app.put('/api/systems/:id/info/:tabId', async (req, res) => {
  const { content } = req.body;
  await pool.query(
    `INSERT INTO nebula.system_info_tabs (system_id, tab_id, content)
     VALUES ($1, $2, $3)
     ON CONFLICT (system_id, tab_id) DO UPDATE SET content = $3, updated_at = NOW()`,
    [req.params.id, req.params.tabId, content]
  );
  res.json({ ok: true });
});
```

### 2.3 Add Bulk Import Endpoint (for localStorage Migration)

Already described in `POSTGRES_CONVERSION.md` Section 6. Add:

```typescript
// POST /api/import — bulk import from localStorage migration
app.post('/api/import', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { systems, requirements, workSessions, preferences, infoTabs } = req.body;

    // Insert systems with their nested subsystems, features, and folders
    for (const sys of (systems || [])) {
      await client.query(
        `INSERT INTO nebula.systems (id, name, description, readme, color, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [sys.id, sys.name, sys.description, sys.readme, sys.color || '#6b7280', sys.position || 0]
      );
      for (const sub of (sys.subsystems || [])) {
        await client.query(
          `INSERT INTO nebula.subsystems (id, system_id, name, description, readme, color, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [sub.id, sys.id, sub.name, sub.description, sub.readme, sub.color, sub.position || 0]
        );
        for (const feat of (sub.features || [])) {
          await client.query(
            `INSERT INTO nebula.features (id, subsystem_id, system_id, name, description, status, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [feat.id, sub.id, sys.id, feat.name, feat.description, feat.status || 'backlog', feat.position || 0]
          );
        }
      }
      for (const folder of (sys.folders || [])) {
        await client.query(
          `INSERT INTO nebula.system_folders (id, system_id, name, parent_id, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [folder.id, sys.id, folder.name, folder.parentId || null, folder.position || 0]
        );
      }
    }

    // Insert requirements
    for (const req of (requirements || [])) {
      await client.query(
        `INSERT INTO nebula.requirements (id, system_id, subsystem_id, feature_id, title, description, status, priority, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [req.id, req.systemId, req.subsystemId, req.featureId, req.title, req.description, req.status, req.priority, 0]
      );
    }

    // Insert work sessions
    for (const sess of (workSessions || [])) {
      await client.query(
        `INSERT INTO nebula.work_sessions (id, parent_id, parent_type, parent_name, context, platform, model, status, message_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [sess.id, sess.parentId, sess.parentType, sess.parentName, sess.context, sess.platform, sess.model, 'active', sess.messageCount || 0]
      );
    }

    // Migrate preferences
    for (const [key, value] of Object.entries(preferences || {})) {
      await client.query(
        `INSERT INTO nebula.user_preferences (user_id, key, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, key) DO UPDATE SET value = $3`,
        ['default', key, JSON.stringify(value)]
      );
    }

    // Migrate info tabs
    for (const [systemId, tabs] of Object.entries(infoTabs || {})) {
      for (const [tabId, content] of Object.entries(tabs as Record<string, string>)) {
        await client.query(
          `INSERT INTO nebula.system_info_tabs (system_id, tab_id, content)
           VALUES ($1, $2, $3)
           ON CONFLICT (system_id, tab_id) DO UPDATE SET content = $3`,
          [systemId, tabId, content]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ imported: true, counts: { systems: (systems || []).length, requirements: (requirements || []).length } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});
```

### 2.4 Add Seed Data Endpoint

Replace client-side `seedData()` with a server endpoint:

```typescript
// POST /api/seed — seed default example data
app.post('/api/seed', async (req, res) => {
  // Only seed if systems table is empty
  const { rows: [{ count }] } = await pool.query('SELECT COUNT(*) FROM nebula.systems');
  if (parseInt(count) > 0) {
    return res.json({ seeded: false, reason: 'already has data' });
  }
  // ... insert example system with subsystem and feature ...
  res.json({ seeded: true });
});
```

---

## Phase 3: Angular Frontend Rewrite

**Working directory:** `/home/codex/dev/nexus/angular/nebula-ui/`

### 3.1 Data Service: Replace localStorage With HTTP

**Files affected:**
- **MODIFY:** `src/services/data.service.ts` — full rewrite of persistence layer
- **MODIFY:** `src/environments/environment.ts` — add `apiUrl`
- **MODIFY:** `src/app.component.ts` — sidebar width from preferences API

### 3.2 Data Service Migration Pattern

**For every CRUD method, follow this pattern:**

```
1. Generate tempId (for optimistic UI)
2. Save previous state snapshot
3. Mutate signal immediately (optimistic)
4. POST/PUT/DELETE to API
5. On success: replace tempId with server response
6. On error: rollback to previous state snapshot
```

**Example — `addSystem()`:**

```typescript
async addSystem(name: string, description: string) {
  const tempId = crypto.randomUUID();
  const previous = this.systems();
  this.systems.update(s => [...s, {
    id: tempId, name, description,
    readme: '', createdAt: Date.now(),
    folders: [], subsystems: []
  }]);

  try {
    const newSystem = await firstValueFrom(
      this.http.post<System>(`${this.apiUrl}/systems`, { name, description })
    );
    this.systems.update(s => s.map(sys =>
      sys.id === tempId ? { ...newSystem, createdAt: new Date(newSystem.createdAt).getTime() } : sys
    ));
  } catch (err) {
    this.systems.set(previous);
    this.error.set('Failed to create system');
    throw err;
  }
}
```

### 3.3 Hydration: Replace `loadFromStorage()` With `fetchFromApi()`

```typescript
private async hydrateFromApi(): Promise<void> {
  this.loading.set(true);
  try {
    const [systems, requirements, sessions] = await Promise.all([
      firstValueFrom(this.http.get<System[]>(`${this.apiUrl}/systems`)),
      firstValueFrom(this.http.get<Requirement[]>(`${this.apiUrl}/requirements`)),
      firstValueFrom(this.http.get<WorkSession[]>(`${this.apiUrl}/sessions`)),
    ]);
    if (systems.length === 0) {
      // Check for localStorage migration
      const legacySystems = localStorage.getItem('nebula_systems');
      if (legacySystems) {
        await this.migrateFromLocalStorage();
        return this.hydrateFromApi(); // re-fetch after migration
      }
      // Seed default data
      await firstValueFrom(this.http.post(`${this.apiUrl}/seed`, {}));
      return this.hydrateFromApi();
    }
    this.systems.set(systems.map(this.normalizeTimestamps));
    this.requirements.set(requirements.map(this.normalizeTimestamps));
    this.sessions.set(sessions.map(this.normalizeTimestamps));
  } finally {
    this.loading.set(false);
  }
}
```

### 3.4 localStorage Migration Flow

```typescript
private async migrateFromLocalStorage(): Promise<void> {
  const systems = JSON.parse(localStorage.getItem('nebula_systems') || '[]');
  const requirements = JSON.parse(localStorage.getItem('nebula_requirements') || '[]');
  const sessions = JSON.parse(localStorage.getItem('nebula_sessions') || '[]');

  // Collect preferences
  const preferences: Record<string, any> = {};
  const darkMode = localStorage.getItem('nebula_dark_mode');
  if (darkMode !== null) preferences.darkMode = darkMode === 'true';
  const sidebarWidth = localStorage.getItem('nebula_sidebar_width');
  if (sidebarWidth !== null) preferences.sidebarWidth = parseInt(sidebarWidth);

  // Collect info tabs
  const infoTabs: Record<string, Record<string, string>> = {};
  for (const sys of systems) {
    const tabs: Record<string, string> = {};
    // Find all localStorage keys matching nebula_info_<sys.id>_*
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      const prefix = `nebula_info_${sys.id}_`;
      if (key.startsWith(prefix)) {
        const tabId = key.slice(prefix.length);
        tabs[tabId] = localStorage.getItem(key) || '';
      }
    }
    if (Object.keys(tabs).length > 0) infoTabs[sys.id] = tabs;
  }

  await firstValueFrom(this.http.post(`${this.apiUrl}/import`, {
    systems, requirements, workSessions: sessions, preferences, infoTabs
  }));

  // Clear localStorage on success
  localStorage.removeItem('nebula_systems');
  localStorage.removeItem('nebula_requirements');
  localStorage.removeItem('nebula_sessions');
  localStorage.removeItem('nebula_dark_mode');
  localStorage.removeItem('nebula_sidebar_width');
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)!;
    if (key.startsWith('nebula_info_')) localStorage.removeItem(key);
  }
}
```

### 3.5 Remove localStorage Auto-Save Effect

Delete the `effect()` that auto-saves signals to localStorage. All persistence
is now server-side via HTTP. The signals remain as the reactive UI layer.

```typescript
// REMOVE this entire block:
// effect(() => {
//   localStorage.setItem('nebula_systems', JSON.stringify(this.systems()));
//   localStorage.setItem('nebula_requirements', JSON.stringify(this.requirements()));
// });
```

### 3.6 System Info Component: Replace localStorage With API

**Files affected:**
- **MODIFY:** `src/components/system-info.component.ts`

Replace all `localStorage.getItem/setItem('nebula_info_*')` calls with HTTP
calls to `GET /api/systems/:id/info` and `PUT /api/systems/:id/info/:tabId`.

### 3.7 App Component: Sidebar Width From Preferences

**Files affected:**
- **MODIFY:** `src/app.component.ts`

Replace `localStorage.getItem/setItem('nebula_sidebar_width')` with calls to
`PUT /api/preferences/sidebarWidth` and hydrate from `GET /api/preferences`.

### 3.8 Dark Mode From Preferences API

Replace `localStorage.getItem/setItem('nebula_dark_mode')` with calls to
`PUT /api/preferences/darkMode` and hydrate from `GET /api/preferences`.

### 3.9 Add Proxy Config

**Files affected:**
- **MODIFY:** `proxy.conf.json` (create if missing)

```json
{
  "/api": {
    "target": "http://localhost:3101",
    "secure": false
  }
}
```

### 3.10 Angular Environment Config

**Files affected:**
- **MODIFY:** `src/environments/environment.ts`
- **MODIFY:** `src/environments/environment.development.ts`

```typescript
export const environment = {
  production: false,
  apiUrl: ''  // empty = same origin; proxy handles /api -> :3101 in dev
};
```

---

## Phase 4: Cleanup

### 4.1 Remove Unused Code

| File | Action |
|------|--------|
| `data.service.ts` — `loadFromStorage()` | Delete method |
| `data.service.ts` — `seedData()` | Delete method |
| `data.service.ts` — localStorage auto-save `effect()` | Delete |
| `data.service.ts` — `importDatabase()` / `exportDatabase()` | Delete or replace with server-side alternatives |
| `system-info.component.ts` — localStorage calls | Replace with HTTP |
| `app.component.ts` — localStorage calls | Replace with HTTP |
| `convex/` directory (if present) | Delete entirely |
| `convex` from `package.json` dependencies | Remove |

### 4.2 Keep Unchanged

| Component | Why |
|-----------|-----|
| `ai.service.ts` (Gemini) | Calls Gemini directly — no backend needed |
| All Angular components (kanban, board, table, hierarchy-nav, work-session) | They consume `DataService` signals — if signal shape stays same, zero component changes |
| `data.models.ts` | Types/interfaces unchanged |
| Tailwind CSS | Unchanged |
| Signals architecture | Unchanged |

---

## Phase 5: Testing & Validation

### 5.1 API Tests

- Run existing nebula E2E tests: `cd nexus/tests/nebula && pytest -v`
- Verify all CRUD endpoints respond correctly
- Test bulk import endpoint with sample localStorage data
- Test preferences CRUD
- Test system info tabs CRUD
- Test seed endpoint (only seeds when DB is empty)

### 5.2 Frontend Tests

- TypeScript compilation: `cd nexus/angular/nebula-ui && npx tsc --noEmit`
- Manual smoke test checklist:
  - [ ] App loads without errors
  - [ ] localStorage migration triggers on first load (if legacy data exists)
  - [ ] Systems CRUD: create, read, update, delete
  - [ ] Subsystems CRUD
  - [ ] Features CRUD
  - [ ] Requirements CRUD + kanban drag-and-drop
  - [ ] Work sessions create and display
  - [ ] Dark mode toggle persists across refresh
  - [ ] Sidebar width persists across refresh
  - [ ] System info tabs save and reload
  - [ ] Seed data appears when DB is empty
  - [ ] Import/export still functional (server-side)

### 5.3 Migration Test

1. Populate localStorage with known test data
2. Load the app — verify migration modal/flow triggers
3. Verify all data appears in PostgreSQL
4. Refresh — verify data loads from API (not localStorage)
5. Verify localStorage keys are cleared

---

## Phase 6: Future Scope (Not In This Plan)

These items are identified but deferred:

1. **Conduit UI localStorage migration** — theme, ai-config, split-ratio
2. **Nexus Console localStorage migration** — config, preferences, bookmarks, file system
3. **Markdown-to-DB migration** — move `.conduit-data/IMPLEMENTATION_PLANS/` etc. to PostgreSQL
4. **Authentication** — multi-user support for preferences
5. **Offline support** — service worker + IndexedDB cache of API responses

---

## Files Affected Summary

### Database
- **MODIFY:** `nexus/tests/nebula/schema.sql` — add readme columns, align enums, add updated_at triggers
- **NEW:** Migration SQL script for existing DBs

### API Server (nexus/typescript/nebula-srv/)
- **MODIFY:** `src/routes.ts` — add preferences, info tabs, import, seed endpoints
- **MODIFY:** `src/index.ts` — ensure CORS, body parser configured

### Angular Frontend (nexus/angular/nebula-ui/)
- **MODIFY:** `src/services/data.service.ts` — full localStorage→HTTP rewrite
- **MODIFY:** `src/services/data.models.ts` — align types with DB schema
- **MODIFY:** `src/components/system-info.component.ts` — localStorage→HTTP
- **MODIFY:** `src/app.component.ts` — sidebar width from API
- **MODIFY:** `src/environments/environment.ts` — add apiUrl
- **MODIFY:** `src/environments/environment.development.ts` — add apiUrl
- **MODIFY:** `proxy.conf.json` — add /api proxy
- **DELETE:** `convex/` directory (if present)

---

## Acceptance Criteria

1. **No localStorage reads/writes in nebula-ui** — grep for `localStorage` returns zero results in `nexus/angular/nebula-ui/src/`
2. **All CRUD operations persist to PostgreSQL** — create a system, refresh, verify it loads
3. **Migration works** — localStorage data auto-imports on first load, keys cleared after
4. **Seed data works** — empty DB auto-seeds on first load
5. **Preferences persist** — dark mode toggle survives page refresh
6. **System info tabs persist** — edit a tab, refresh, verify content is intact
7. **TypeScript compiles** — `npx tsc --noEmit` passes
8. **Existing tests pass** — nebula E2E tests pass
9. **Kanban drag-and-drop works** — status changes persist across refresh
10. **Sidebar width persists** — resize sidebar, refresh, width is restored

---

*Plan created: 2026-06-15. References POSTGRES_CONVERSION.md for additional
design rationale and implementation patterns.*
