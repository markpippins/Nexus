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

const DURATION_UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, ms: 0.001 };

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
  value: string
): ScheduleValidation {
  if (scheduleType === 'manual') {
    return { ok: true, message: 'manual — runs on demand only' };
  }
  if (scheduleType === 'cron') {
    const err = validateCronExpression(value);
    if (err) return { ok: false, message: `invalid cron — ${err}` };
    // Format-level confirmation: the expression is a well-formed cron. The
    // runner currently re-fires interval schedules only, so don't over-claim
    // that this schedule will be honored as-is.
    return { ok: true, message: `valid cron format — ${describeCronExpression(value)}` };
  }
  return validateIntervalExpression(value);
}
