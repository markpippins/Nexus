# AttemptsView Specification

> **Status:** Proposed  
> **Target file:** `src/components/AttemptsView.tsx`  
> **Nav tab:** `'attempts'`  
> **Sidebar icon:** `PlayCircle` (emerald-400)  
> **Aligned views:** `RequestsView`, `LeasesView`, `ReceiptsOriginView`

---

## 1. Purpose

`AttemptsView` replaces the current placeholder in `App.tsx` (line ~191, where
`currentTab === 'attempts'` renders `RequestsView`). It provides a paginated,
filterable table of all execution attempts from `execution.attempts`, with a
click-to-inspect detail drawer.

---

## 2. Data Source

| Concern | Implementation |
|---|---|
| **API** | `executionApi.listAttempts(filter)` — already wired in `apiClient.ts` |
| **Mapping** | `mapAttemptItem(raw, index)` in `apiAdapters.ts` — handles `completed_at`→`finished_at`, `error`→`error_message` |
| **Mock** | Falls back to `mockStore.listAttempts(filter)` on error or when mock mode is on |
| **Endpoint** | `GET /api/execution/attempts?status=&search=&limit=20&offset=0` |

The returned shape is `{ total: number, items: AttemptItem[] }`.

---

## 3. Component Signature

```tsx
interface AttemptsViewProps {
  onSelectRequest: (id: string) => void;
  onSelectLease: (id: string) => void;
  setCurrentTab: (tab: NavTab) => void;
}

export const AttemptsView: React.FC<AttemptsViewProps>;
```

Unlike `RequestsView` and `LeasesView`, there is no dedicated detail endpoint
for a single attempt. The inspector shows the full `AttemptItem` record inline,
plus clickable links to jump to the parent request or lease.

---

## 4. Layout

Same split-pane pattern as the three existing views:

```
┌─────────────────────────────────────────────────────────────┐
│  Filter & Search Bar (status dropdown, text search, pagination) │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┬──────────────────────────────────┐ │
│  │  ATTEMPTS TABLE      │  ATTEMPT DETAIL INSPECTOR        │ │
│  │  (lg:col-span-5)     │  (lg:col-span-7)                 │ │
│  │                      │  Appears when row is clicked.    │ │
│  │  - Attempt ID        │  ┌─────────────────────────────┐ │ │
│  │  - Status pill       │  │ Attempt ID, Status, #        │ │ │
│  │  - Request ID        │  ├─────────────────────────────┤ │ │
│  │  - Lease ID          │  │ Parent Links:               │ │ │
│  │  - Executor          │  │   → Request {id}             │ │ │
│  │  - Started / Duration│  │   → Lease {id}               │ │ │
│  │                      │  ├─────────────────────────────┤ │ │
│  │                      │  │ Timing: started_at,          │ │ │
│  │                      │  │ finished_at, duration calc   │ │ │
│  │                      │  ├─────────────────────────────┤ │ │
│  │                      │  │ Error block (if FAILED or    │ │ │
│  │                      │  │ TIMED_OUT)                   │ │ │
│  │                      │  ├─────────────────────────────┤ │ │
│  │                      │  │ Associated Receipts (stretch)│ │ │
│  │                      │  └─────────────────────────────┘ │ │
│  └──────────────────────┴──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Table Columns

| Column | Source field | Styling |
|---|---|---|
| **Attempt ID** | `item.id` | `text-emerald-400 font-bold font-mono truncate` |
| **Status** | `item.status` | Colored pill (see §6) |
| **Attempt #** | `item.attempt_number` | `text-slate-400` |
| **Request ID** | `item.request_id` | `text-blue-400 truncate max-w-[120px]` |
| **Lease ID** | `item.lease_id` | `text-amber-300 truncate max-w-[120px]` |
| **Executor** | `item.executor_id` | `text-slate-300` |
| **Started** | `item.started_at` | `text-slate-500 text-[10px] text-right` (HH:MM:SS) |

Table header label: `ATTEMPTS EXECUTION LOG` with `PlayCircle` (emerald-400).  
Table sub-label: `execution.attempts`.

Row highlight on selection: `bg-emerald-500/15 border-l-2 border-l-emerald-400`.

---

## 6. Status Pills

Match the convention from `RequestsView.getStatusPill`:

| Status | Colors |
|---|---|
| `SUCCEEDED` | `bg-emerald-500/20 text-emerald-400 border-emerald-500/40` |
| `RUNNING` | `bg-blue-500/20 text-blue-400 border-blue-500/40 animate-pulse` |
| `CREATED` | `bg-indigo-500/20 text-indigo-400 border-indigo-500/40` |
| `FAILED` | `bg-red-500/20 text-red-400 border-red-500/40` |
| `TIMED_OUT` | `bg-amber-500/20 text-amber-400 border-amber-500/40` |

---

## 7. Filter & Search Bar

Same pattern as the other views (search input + status dropdown + pagination):

- **Search:** `ILIKE` across `id::text`, `request_id::text`, `lease_id::text`, `executor_id::text`, `error::text`
- **Status filter:** `<select>` with options: All, CREATED, RUNNING, SUCCEEDED, FAILED, TIMED_OUT
- **Pagination:** limit=20, ChevronLeft/ChevronRight buttons, "Showing X of Y" label
- Focus border color: `focus:border-emerald-500`

---

## 8. Inspector Detail Drawer

Opens when a row is clicked. No dedicated detail endpoint exists, so the
inspector renders the full `AttemptItem` object already in memory.

### Sections

#### 8a. Header
- `PlayCircle` icon + "Attempt Detail: {id}" + close button
- Subtitle: "execution.attempts record — inline inspector"

#### 8b. Status & Identity Card
- Badge: current status (same pill as table)
- Attempt number
- Duration: computed as `(finished_at - started_at)` if both exist, otherwise "In progress" with a pulse indicator
- On FAILED/TIMED_OUT: error message block with red-tinted `<pre>` or `<code>` block showing `item.error_message`

#### 8c. Parent Links Card
- "Parent Request" → clickable link that calls `onSelectRequest(item.request_id)`
- "Holding Lease" → clickable link that calls `onSelectLease(item.lease_id)`
- Each link uses `ExternalLink` icon and `text-blue-400 hover:underline`

#### 8d. Timing Card
- `started_at`: full locale string
- `finished_at`: full locale string or "NULL (IN PROGRESS)"
- Duration bar: visual bar showing elapsed percentage (similar to LeasesView TTL bar but simpler). If finished: full bar in emerald. If running and no timeout: indeterminate pulse bar.

#### 8e. Stretch Goal — Associated Receipts
- If time permits: call `GET /api/execution/receipts?search={attempt_id}&limit=50` to find receipts linked to this attempt, show them in a mini table or JSON blob. This is optional and should be marked as such in code comments.

---

## 9. State Management

```ts
const [attempts, setAttempts] = useState<AttemptItem[]>([]);
const [totalCount, setTotalCount] = useState(0);
const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
const [statusFilter, setStatusFilter] = useState<string>('');
const [searchQuery, setSearchQuery] = useState('');
const [page, setPage] = useState(0);
const limit = 20;
```

The selected attempt object is derived from `attempts.find(a => a.id === selectedAttemptId)` — no separate fetch needed.

---

## 10. Integration Points

| File | Change |
|---|---|
| `src/components/AttemptsView.tsx` | **NEW** — the component |
| `src/App.tsx` | Replace the `RequestsView` placeholder under `currentTab === 'attempts'` with `<AttemptsView onSelectRequest={...} onSelectLease={...} setCurrentTab={...} />` |
| `src/components/Sidebar.tsx` | Already has `PlayCircle` Attempts entry — no change |
| `src/types.ts` | `AttemptItem` and `AttemptStatus` already defined — no change |

---

## 11. Theme & Color System

- **Primary accent:** emerald-400 (matches `PlayCircle` icon and `SUCCEEDED` status)
- **Table row hover:** `hover:bg-slate-800/50`
- **Selected row:** `bg-emerald-500/15 text-slate-100 font-semibold border-l-2 border-l-emerald-400`
- **Failed/Timed-out rows:** subtle red/amber tint on hover (`bg-red-500/5` / `bg-amber-500/5`)
- **All cards:** `bg-slate-950/80 border border-slate-800 rounded`
- **Font:** `font-mono` for data, `font-sans` for labels; `text-xs` base, `text-[10px]` for meta

---

## 12. Acceptance Criteria

1. **AC1:** Clicking "Attempts" in the sidebar renders `AttemptsView`, not `RequestsView`
2. **AC2:** In mock mode, the table shows 20+ attempts with realistic data (IDs like `att_000001`, status distribution, varied executors)
3. **AC3:** In live mode, the table loads from `GET /api/execution/attempts` with correct pagination
4. **AC4:** Status filter dropdown filters by attempt status (CREATED/RUNNING/SUCCEEDED/FAILED/TIMED_OUT)
5. **AC5:** Search box filters across attempt ID, request ID, lease ID, executor ID, and error text
6. **AC6:** Clicking a row opens the detail inspector on the right
7. **AC7:** Detail inspector shows status, attempt number, duration, timing fields
8. **AC8:** Detail inspector shows parent links: clicking Request ID calls `onSelectRequest`, clicking Lease ID calls `onSelectLease`
9. **AC9:** FAILED and TIMED_OUT attempts show the error message in the inspector
10. **AC10:** Pagination works: page forward/back, showing X of Y
11. **AC11:** Layout is responsive: full-width table when no row selected, split 5/12 + 7/12 when inspector is open
