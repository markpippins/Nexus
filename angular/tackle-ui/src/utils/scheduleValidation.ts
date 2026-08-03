// ── Schedule expression validation (cron / interval) ────────────────
// Pure functions used by the scheduler dialog for live inline validation.
// Mirrors the semantics operators expect: 5-field standard cron (with
// names/step/range/list support) and positive interval durations
// (plain seconds or <n>s/m/h/d). The DB stores seconds (INTEGER); the
// runner fires `interval` entries when `last_run_at + value < now()`.

export interface ScheduleValidation {
  ok: boolean;
  /** Inline message shown under the field (error when !ok, confirmation when ok). */
  message: string;
  /** Humanized description, e.g. "every 15 minutes" (valid expressions only). */
  humanized?: string;
  /** Resolved next fire time (interval: from last_run_at; cron: next occurrence). */
  nextRunAt?: Date | null;
  /** Human-readable next-fire preview line, e.g. "Next fire: in 2h (Tue 12:00)". */
  nextRunLabel?: string;
}

const CRON_MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};
const CRON_DAY_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6
};

function parseCronToken(token: string, names: Record<string, number>): number | null {
  const lower = token.toLowerCase();
  if (lower in names) return names[lower];
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  return null;
}

/**
 * Validate a single cron field. Returns an error string, or null when valid.
 * Supports `*`, `?` (day fields), lists `a,b`, ranges `a-b`, steps (e.g.
 * 0-30/5) and month/day names (JAN..DEC, SUN..SAT).
 */
function validateCronField(
  field: string,
  min: number,
  max: number,
  names: Record<string, number>,
  allowQuestion: boolean
): string | null {
  if (field === '*') return null;
  if (field === '?' && allowQuestion) return null;
  for (const part of field.split(',')) {
    if (!part) return 'empty list value';
    const pieces = part.split('/');
    if (pieces.length > 2) return `too many "/" in "${part}"`;
    const rangeExpr = pieces[0];
    const stepStr = pieces.length === 2 ? pieces[1] : undefined;

    let lo: number;
    let hi: number;
    if (rangeExpr === '*') {
      lo = min;
      hi = max;
    } else {
      const dash = rangeExpr.split('-');
      if (dash.length > 2) return `too many "-" in "${part}"`;
      const a = parseCronToken(dash[0], names);
      if (a === null) return `"${dash[0]}" is not a number or name`;
      if (a < min || a > max) return `"${dash[0]}" out of range ${min}-${max}`;
      if (dash.length === 2) {
        const b = parseCronToken(dash[1], names);
        if (b === null) return `"${dash[1]}" is not a number or name`;
        if (b < min || b > max) return `"${dash[1]}" out of range ${min}-${max}`;
        if (b < a) return `range "${part}" starts after it ends`;
        lo = a;
        hi = b;
      } else {
        lo = a;
        hi = a;
      }
    }

    if (stepStr !== undefined) {
      if (!/^\d+$/.test(stepStr)) return `step "${stepStr}" must be a number`;
      const step = parseInt(stepStr, 10);
      if (step < 1 || step > max) return `step must be between 1 and ${max}`;
      if (rangeExpr !== '*' && hi - lo < 1 && step > 1) return 'step does not fit the range';
    }
  }
  return null;
}

const CRON_FIELD_DEFS: { min: number; max: number; names: Record<string, number>; allowQ: boolean }[] = [
  { min: 0, max: 59, names: {}, allowQ: false },          // minute
  { min: 0, max: 23, names: {}, allowQ: false },          // hour
  { min: 1, max: 31, names: {}, allowQ: true },           // day of month
  { min: 1, max: 12, names: CRON_MONTH_NAMES, allowQ: false }, // month
  { min: 0, max: 7, names: CRON_DAY_NAMES, allowQ: true } // day of week (0-7, 7 = Sunday)
];
const CRON_FIELD_LABELS = ['minute', 'hour', 'day of month', 'month', 'day of week'];

/** Returns an error message, or null when the cron expression is valid. */
export function validateCronExpression(expr: string): string | null {
  const trimmed = expr.trim();
  if (!trimmed) return 'expression is required';
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) {
    return `expected 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}`;
  }
  for (let i = 0; i < 5; i++) {
    const d = CRON_FIELD_DEFS[i];
    const err = validateCronField(fields[i], d.min, d.max, d.names, d.allowQ);
    if (err) return `${CRON_FIELD_LABELS[i]}: ${err}`;
  }
  return null;
}

/** Compact English description of a cron expression, e.g. "at minute 0 every 2 hours". */
export function describeCronExpression(expr: string): string {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = fields;
  const parts: string[] = [];
  if (min !== '*') parts.push(`at minute ${min}`);
  if (hour !== '*') parts.push(`hour ${hour}`);
  if (dom !== '*' && dom !== '?') parts.push(`day ${dom} of month`);
  if (mon !== '*') parts.push(`month ${mon}`);
  if (dow !== '*' && dow !== '?') parts.push(`weekday ${dow}`);
  return parts.length ? parts.join(', ') : 'every minute';
}

// ── Next-fire time resolution ─────────────────────────────────────────
// The runner (python/conduit/agent_scheduler_runner.py) marks an entry
// due when: enabled AND type <> 'manual' AND (last_run_at IS NULL OR
// (type = 'interval' AND now - last_run_at >= schedule_value)). Cron
// strings are stored as-is but never re-parsed by the runner, so the
// cron preview below is a format-level "next occurrence" calculation.

const DURATION_UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, ms: 0.001 };

/** Expand a cron field into the set of allowed values (names resolved). */
function expandCronField(
  field: string,
  min: number,
  max: number,
  names: Record<string, number>
): Set<number> | null {
  if (field === '*' || field === '?') return null; // unrestricted
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const [rangeExpr, stepStr] = part.split('/');
    const step = stepStr ? parseInt(stepStr, 10) : 1;
    let lo: number;
    let hi: number;
    if (rangeExpr === '*') {
      lo = min;
      hi = max;
    } else {
      const [a, b] = rangeExpr.split('-');
      const av = parseCronToken(a, names);
      const bv = b !== undefined ? parseCronToken(b, names) : av;
      if (av === null || bv === null) return null;
      lo = av;
      hi = bv;
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/**
 * Parse a validated cron expression into per-field value sets.
 * minute/hour/month are concrete Sets; dom/dow are null when
 * unrestricted (for standard dom/dow OR semantics when both set).
 */
function parseCronSets(
  expr: string
): {
  minute: Set<number>;
  hour: Set<number>;
  month: Set<number>;
  dom: Set<number> | null;
  dow: Set<number> | null;
} | null {
  const trimmed = expr.trim();
  if (validateCronExpression(trimmed) !== null) return null;
  const [minF, hourF, domF, monF, dowF] = trimmed.split(/\s+/);
  const all = (min: number, max: number) => {
    const s = new Set<number>();
    for (let v = min; v <= max; v++) s.add(v);
    return s;
  };
  const minute = expandCronField(minF, 0, 59, {}) ?? all(0, 59);
  const hour = expandCronField(hourF, 0, 23, {}) ?? all(0, 23);
  const month = expandCronField(monF, 1, 12, CRON_MONTH_NAMES) ?? all(1, 12);
  const dom = expandCronField(domF, 1, 31, {});
  const dowRaw = expandCronField(dowF, 0, 7, CRON_DAY_NAMES);
  // dow: 0 and 7 are both Sunday; normalize 7 -> 0
  const dow = dowRaw ? new Set([...dowRaw].map(v => v % 7)) : null;
  return { minute, hour, month, dom, dow };
}

function matchesDay(sets: ReturnType<typeof parseCronSets>, y: number, m: number, d: number): boolean {
  if (!sets) return false;
  if (!sets.month.has(m + 1)) return false;
  const domMatch = sets.dom === null || sets.dom.has(d);
  const dowMatch = sets.dow === null || sets.dow.has(new Date(y, m, d).getDay());
  // Standard cron: when both dom and dow are restricted, fire on EITHER match.
  if (sets.dom !== null && sets.dow !== null) return domMatch || dowMatch;
  return domMatch && dowMatch;
}

/**
 * Compute the next fire time for a cron expression, strictly after `from`.
 * Returns null when the expression can never fire within the 3-year
 * horizon (e.g. "0 0 31 2 *" — Feb 31st never exists).
 */
export function computeNextCronFire(expr: string, from: Date = new Date()): Date | null {
  const sets = parseCronSets(expr);
  if (!sets) return null;
  const start = new Date(from);
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1); // strictly after `from`
  for (let i = 0; i < 1096; i++) { // ~3 years of days
    const y = start.getFullYear();
    const m = start.getMonth();
    const d = start.getDate();
    if (matchesDay(sets, y, m, d)) {
      const hStart = i === 0 ? start.getHours() : 0;
      for (let h = hStart; h < 24; h++) {
        if (!sets.hour.has(h)) continue;
        const mStart = i === 0 && h === hStart ? start.getMinutes() : 0;
        for (let min = mStart; min < 60; min++) {
          if (!sets.minute.has(min)) continue;
          return new Date(y, m, d, h, min, 0, 0);
        }
      }
    }
    start.setDate(start.getDate() + 1);
  }
  return null;
}

/** Relative "in 2h / in 15m / in 4d" label for a future date. */
export function relativeUntil(date: Date, now: Date = new Date()): string {
  const secs = Math.max(0, Math.round((date.getTime() - now.getTime()) / 1000));
  if (secs < 60) return 'in <1m';
  return `in ${humanizeDuration(secs)}`;
}

/** Parse an interval duration ("15m", "1h", "90", "30s") into seconds, or null. */
export function parseIntervalSeconds(value: string): number | null {
  const t = value.trim();
  const m = /^(\d+)(ms|s|m|h|d)?$/.exec(t);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const secs = n * (DURATION_UNITS[m[2] || 's']);
  return secs >= 1 ? secs : null;
}

/** Compact humanized duration, e.g. 900 -> "15m", 43200 -> "12h". */
export function humanizeDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${Math.round(totalSeconds)}s`;
  if (totalSeconds < 3600) return `${Math.floor(totalSeconds / 60)}m`;
  if (totalSeconds < 86400) return `${Math.floor(totalSeconds / 3600)}h`;
  return `${Math.floor(totalSeconds / 86400)}d`;
}

export function validateIntervalExpression(value: string): ScheduleValidation {
  const t = value.trim();
  if (!t) return { ok: false, message: 'interval is required' };
  if (!/^(\d+)(ms|s|m|h|d)?$/.test(t)) {
    return { ok: false, message: 'use a number or a duration like 30s, 15m, 1h, 2d (plain numbers = seconds)' };
  }
  const secs = parseIntervalSeconds(t);
  if (secs === null) return { ok: false, message: 'interval must be at least 1 second' };
  const humanized = humanizeDuration(secs);
  return { ok: true, message: `valid interval — runs every ${humanized}`, humanized };
}

/**
 * Validate the whole expression against the selected schedule type.
 * `manual` entries run on demand only and need no expression.
 */
export function validateScheduleExpression(
  scheduleType: 'cron' | 'interval' | 'manual',
  value: string,
  opts?: { lastRunAt?: string | null }
): ScheduleValidation {
  if (scheduleType === 'manual') {
    return {
      ok: true,
      message: 'manual — runs on demand only',
      nextRunLabel: 'Next fire: on demand — no automatic fire'
    };
  }
  if (scheduleType === 'cron') {
    const err = validateCronExpression(value);
    if (err) return { ok: false, message: `invalid cron — ${err}` };
    // Format-level confirmation: the expression is a well-formed cron. The
    // runner currently re-fires interval schedules only, so don't over-claim
    // that this schedule will be honored as-is — the fire time below is the
    // computed next occurrence of the expression, not a runner guarantee.
    const next = computeNextCronFire(value);
    if (!next) {
      return {
        ok: true,
        message: `valid cron format — ${describeCronExpression(value)}`,
        nextRunAt: null,
        nextRunLabel: 'Next fire: never (expression cannot occur within 3 years)'
      };
    }
    return {
      ok: true,
      message: `valid cron format — ${describeCronExpression(value)}`,
      nextRunAt: next,
      nextRunLabel: `Next fire (cron preview): ${next.toLocaleString()} (${relativeUntil(next)})`
    };
  }
  const res = validateIntervalExpression(value);
  if (!res.ok) return res;
  const secs = parseIntervalSeconds(value);
  if (secs === null) return res;
  const lastRunMs = opts?.lastRunAt ? Date.parse(opts.lastRunAt) : NaN;
  const now = Date.now();
  if (Number.isNaN(lastRunMs) || lastRunMs + secs * 1000 <= now) {
    // Never run yet, or the interval has already elapsed since the last run.
    const neverRun = Number.isNaN(lastRunMs);
    return {
      ...res,
      nextRunAt: null,
      nextRunLabel: neverRun
        ? 'Next fire: on next runner poll (never run — due immediately)'
        : 'Next fire: on next runner poll (interval elapsed since last run)'
    };
  }
  const fire = new Date(lastRunMs + secs * 1000);
  return {
    ...res,
    nextRunAt: fire,
    nextRunLabel: `Next fire: ${fire.toLocaleString()} (${relativeUntil(fire, new Date(now))})`
  };
}
