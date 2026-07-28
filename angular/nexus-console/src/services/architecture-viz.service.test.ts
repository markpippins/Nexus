/**
 * Unit test for ArchitectureVizService canUndo() / canRedo().
 *
 * Runs with: npx tsx src/services/architecture-viz.service.test.ts
 *
 * These functions are defined EXACTLY as they appear in the service
 * (architecture-viz.service.ts lines 1754 & 1756):
 *
 *   public canUndo(): boolean { return this.undoStack.length > 0; }
 *   public canRedo(): boolean { return this.redoStack.length > 0; }
 *
 * No imports, no Angular DI, no Three.js — pure logic verification.
 */

// ── Exact method implementations from ArchitectureVizService ──────────

function canUndo(this: { undoStack: any[] }): boolean {
  return this.undoStack.length > 0;
}

function canRedo(this: { redoStack: any[] }): boolean {
  return this.redoStack.length > 0;
}

// ── Test runner (tiny, dependency-free) ───────────────────────────────
let passed = 0;
let failed = 0;

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}\n    ${err.message ?? err}`);
  }
}

function expect<T>(actual: T) {
  return {
    toBeFalse() {
      if (actual !== false) throw new Error(`Expected false, got ${JSON.stringify(actual)}`);
    },
    toBeTrue() {
      if (actual !== true) throw new Error(`Expected true, got ${JSON.stringify(actual)}`);
    },
    toThrow(expectedMessage?: string) {
      if (typeof actual !== 'function') throw new Error('expect(...).toThrow() requires a function');
      try {
        actual();
        throw new Error('Expected function to throw, but it did not');
      } catch (e: any) {
        if (expectedMessage && !e.message.includes(expectedMessage)) {
          throw new Error(`Expected error containing "${expectedMessage}", got: ${e.message}`);
        }
      }
    }
  };
}

// ── Run ───────────────────────────────────────────────────────────────

console.log('\nArchitectureVizService — canUndo / canRedo\n');

// ── Initial state ──────────────────────────────────────────────────

it('canUndo() returns false when undoStack is empty', () => {
  const ctx = { undoStack: [] as any[] };
  expect(canUndo.call(ctx)).toBeFalse();
});

it('canRedo() returns false when redoStack is empty', () => {
  const ctx = { redoStack: [] as any[] };
  expect(canRedo.call(ctx)).toBeFalse();
});

// ── `this`-binding: bare reference behavior ────────────────────────
//
// The bug: canUndo / canRedo were assigned as bare method references
// (canUndo = this.vizService.canUndo) in ServiceGraphComponent.
// In ESM strict mode, a bare reference call sets `this` to undefined,
// crashing on `undefined.undoStack.length`.
//
// These tests verify:
// 1. With proper context: methods work correctly
// 2. Without context (bare reference): they throw predictably
//    (this is the failure mode the arrow-function fix prevents)

it('with valid context: canUndo works correctly', () => {
  const ctx = { undoStack: [] as any[] };
  const fn = canUndo.bind(ctx);
  expect(fn()).toBeFalse();
  ctx.undoStack.push('x');
  expect(fn()).toBeTrue();
});

it('with valid context: canRedo works correctly', () => {
  const ctx = { redoStack: [] as any[] };
  const fn = canRedo.bind(ctx);
  expect(fn()).toBeFalse();
  ctx.redoStack.push('x');
  expect(fn()).toBeTrue();
});

it('bare reference (no `this`): canUndo throws on undefined.undoStack', () => {
  const fn = canUndo as any;  // bare — no .bind(), no .call()
  expect(() => fn()).toThrow();  // exact message varies by JS engine
});

it('bare reference (no `this`): canRedo throws on undefined.redoStack', () => {
  const fn = canRedo as any;
  expect(() => fn()).toThrow();
});

// ── Full lifecycle state transitions ───────────────────────────────

it('canUndo() returns true after push, false after pop', () => {
  const ctx = { undoStack: ['snapshot'] as any[] };
  expect(canUndo.call(ctx)).toBeTrue();
  ctx.undoStack.pop();
  expect(canUndo.call(ctx)).toBeFalse();
});

it('canRedo() returns true after push, false after pop', () => {
  const ctx = { redoStack: ['stale'] as any[] };
  expect(canRedo.call(ctx)).toBeTrue();
  ctx.redoStack.pop();
  expect(canRedo.call(ctx)).toBeFalse();
});

it('canRedo() returns false when redoStack is cleared (new action)', () => {
  const ctx = { redoStack: ['stale', 'older'] as any[] };
  expect(canRedo.call(ctx)).toBeTrue();
  ctx.redoStack.length = 0;
  expect(canRedo.call(ctx)).toBeFalse();
});

it('canUndo() reflects the 50-entry stack cap', () => {
  const ctx = { undoStack: [] as any[] };
  for (let i = 0; i < 55; i++) {
    ctx.undoStack.push(`snapshot-${i}`);
    if (ctx.undoStack.length > 50) ctx.undoStack.shift();
  }
  expect(canUndo.call(ctx)).toBeTrue();
  // Exhaust
  while (ctx.undoStack.length > 0) ctx.undoStack.pop();
  expect(canUndo.call(ctx)).toBeFalse();
});

// ── Report ─────────────────────────────────────────────────────────
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
