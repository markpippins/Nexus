/**
 * orb-palette.ts — The Nexus orb's color-state engine.
 *
 * The orb is the system's *avatar*, not a status indicator: its three
 * shader colors drift slowly through a 3D color space as a side-effect of
 * events and system state. Today the console cannot consume system events,
 * so the event stream is synthesized deterministically from the wall clock.
 * The mechanics are event-driven underneath, and the same `applyEvent`
 * interface is what a real event bus would feed later — swap the source,
 * keep the mechanics.
 *
 * Model
 * -----
 * Each of the orb's three colors (c1, c2, c3) is a point in the RGB unit
 * cube. Every channel is a bounded random walk with mean reversion:
 *
 *   - Events push a channel up (+) or down (−) by a small step.
 *   - Mean reversion pulls every channel back toward its base color, so the
 *     palette meanders but never saturates at 0/1 and always returns to its
 *     identity region.
 *   - Seasonal sinusoids (diurnal / weekly / yearly, incommensurate periods)
 *     add continuous drift between discrete events — the avatar never stands
 *     still, even when no event fires.
 *
 * Determinism
 * -----------
 * Events are derived by hashing the tick index (time / TICK_MS), so the
 * palette at any instant is a pure function of the clock: reproducible
 * across reloads, no persistence, unit-testable. Initial state is computed
 * by integrating the walk from a fixed epoch; after that only new ticks are
 * applied incrementally (a few float ops per event).
 *
 * Tempo
 * -----
 * Default cadence is one event every 5 minutes with small steps and slow
 * reversion — the full palette evolves over hours to days. Nothing here
 * reacts in real time; the fast noise animation stays in the shader.
 */

export interface RgbVec {
  r: number;
  g: number;
  b: number;
}

export type ChannelKey = 'r' | 'g' | 'b';

/** A single palette event: push one channel of one color by ±delta. */
export interface PaletteEvent {
  color: 0 | 1 | 2;
  channel: ChannelKey;
  delta: number; // signed; positive = brighter, negative = dimmer
}

const CHANNELS: ChannelKey[] = ['r', 'g', 'b'];

/** Base colors (identity region) — match the orb's original look. */
const BASE_COLORS: RgbVec[] = [
  { r: 0.80, g: 0.04, b: 0.90 }, // uColor1 — magenta (#cc0ae6)
  { r: 0.04, g: 0.30, b: 0.93 }, // uColor2 — blue   (#094dec)
  { r: 1.00, g: 1.00, b: 1.00 }, // uColor3 — white highlight
];

/**
 * Per-color channel bounds. The two chromatic colors wander wide; the white
 * highlight is kept near white (it is the fresnel/glow accent, not a hue).
 */
const BOUNDS: Array<{ min: number; max: number }> = [
  { min: 0.05, max: 0.95 },
  { min: 0.05, max: 0.95 },
  { min: 0.65, max: 1.0 },
];

/** Epoch of the avatar's clock — everything integrates from here. */
export const EPOCH_MS = Date.UTC(2026, 0, 1);

/** Cadence of the synthetic event stream — one event per hour. */
const TICK_MS = 3600 * 1000;

/** Mean-reversion strength per tick (fraction of distance back to base). */
const REVERSION = 0.08;

/**
 * Seasonal drift amplitudes (per channel), applied continuously.
 * These carry the *visible* long-term evolution: diurnal breathing, weekly
 * undulation, yearly season. The discrete events only nudge the palette;
 * with incommensurate periods the combined drift never repeats.
 */
const SEASONAL: Array<{ periodMs: number; amp: number }> = [
  { periodMs: 24 * 3600 * 1000, amp: 0.012 },          // diurnal
  { periodMs: 7 * 24 * 3600 * 1000, amp: 0.020 },      // weekly
  { periodMs: 365.25 * 24 * 3600 * 1000, amp: 0.050 }, // yearly
];

/** Deterministic 32-bit integer hash (splitmix-ish, no deps). */
function hash32(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class OrbPaletteDriver {
  /** Walk state (mutated only by deterministic tick integration). */
  private state: RgbVec[] = BASE_COLORS.map(c => ({ ...c }));

  /** Tick index of the last applied event. */
  private currentTick = Math.floor(EPOCH_MS / TICK_MS) - 1;

  /** Derive the deterministic pseudo-event for a tick index. */
  private eventForTick(tick: number): PaletteEvent {
    const h = hash32(Math.imul(tick, 2654435761));
    return {
      color: (h % 3) as 0 | 1 | 2,
      channel: CHANNELS[(h >>> 2) % 3],
      // Small signed step: ±(0.003 .. 0.033). One event per hour with this
      // size keeps the walk subtle (≈0.01/hour) — the seasons do the big
      // moving.
      delta: ((h >>> 4) % 2 === 0 ? 1 : -1) * (0.003 + 0.006 * ((h >>> 5) % 5)),
    };
  }

  /** Apply one event to the walk state (event increment/decrement + reversion). */
  private applyEvent(ev: PaletteEvent): void {
    const c = this.state[ev.color];
    const b = BASE_COLORS[ev.color];
    const bounds = BOUNDS[ev.color];
    c[ev.channel] += ev.delta;
    // Mean reversion — drift back toward the identity color.
    c[ev.channel] += (b[ev.channel] - c[ev.channel]) * REVERSION;
    // Soft bounds — never saturate; reversion would unstick us anyway.
    c[ev.channel] = clamp(c[ev.channel], bounds.min, bounds.max);
  }

  /**
   * Advance the walk to the tick containing `nowMs` (integrating from the
   * epoch on first call, incrementally afterwards).
   *
   * Forward-only: the walk never rewinds, so calls must pass monotonically
   * increasing timestamps (the renderer feeds Date.now() every frame, which
   * is monotonic). Querying an earlier instant after a later one yields the
   * later walk state — `paletteAt` remains a pure function of the clock for
   * any fresh driver, which is all the avatar needs.
   */
  private advanceTo(nowMs: number): void {
    const target = Math.floor(nowMs / TICK_MS);
    while (this.currentTick < target) {
      this.currentTick++;
      this.applyEvent(this.eventForTick(this.currentTick));
    }
  }

  /** Continuous seasonal drift at `nowMs` (pure function — no state). */
  private seasonal(nowMs: number): RgbVec[] {
    const drift: RgbVec[] = BASE_COLORS.map(() => ({ r: 0, g: 0, b: 0 }));
    SEASONAL.forEach(({ periodMs, amp }, s) => {
      const phase = Math.PI * 2 * s; // per-band phase offset keeps colors from locking step
      const t = (2 * Math.PI * (nowMs % periodMs)) / periodMs + phase;
      for (let c = 0; c < 3; c++) {
        // Slight per-color phase shift so the three hues drift independently.
        const tc = t + (c * Math.PI * 2) / 3;
        drift[c].r += amp * Math.sin(tc);
        drift[c].g += amp * Math.sin(tc + 1.3);
        drift[c].b += amp * Math.sin(tc + 2.6);
      }
    });
    return drift;
  }

  /**
   * Apply an external palette event immediately (real system events, once
   * the console consumes them). Same mechanics as the time-derived stream.
   */
  applyEventNow(ev: PaletteEvent): void {
    this.applyEvent(ev);
  }

  /**
   * Palette at `nowMs`: deterministic walk (events) + seasonal drift,
   * clamped to bounds. Returns fresh copies — safe to hand to the renderer.
   */
  paletteAt(nowMs: number): RgbVec[] {
    this.advanceTo(nowMs);
    const drift = this.seasonal(nowMs);
    return this.state.map((c, i) => {
      const bounds = BOUNDS[i];
      return {
        r: clamp(c.r + drift[i].r, bounds.min, bounds.max),
        g: clamp(c.g + drift[i].g, bounds.min, bounds.max),
        b: clamp(c.b + drift[i].b, bounds.min, bounds.max),
      };
    });
  }
}
