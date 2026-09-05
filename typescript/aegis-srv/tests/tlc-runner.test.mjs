import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseTlcOutput, exitToStatus, buildCfg, extractModuleName } = require('../dist/tlc-runner.js');

// ── exitToStatus ──────────────────────────────────────────────────────
test('exitToStatus maps TLC exit codes', () => {
  assert.equal(exitToStatus(0), 'success');
  assert.equal(exitToStatus(11), 'failure');   // deadlock
  assert.equal(exitToStatus(12), 'failure');   // invariant/property violation
  assert.equal(exitToStatus(150), 'error');    // parse/semantic error
  assert.equal(exitToStatus(1), 'error');
});

// ── parseTlcOutput: success ───────────────────────────────────────────
const SUCCESS = [
  'TLC2 Version 2.19',
  '@!@!@STARTMSG 2200:0 @!@!@',
  'Progress: 4 states generated',
  '@!@!@ENDMSG 2200 @!@!@',
  'Model checking completed. No error has been found.',
  '@!@!@STARTMSG 2199:0 @!@!@',
  '4 states generated, 3 distinct states found, 0 states left on queue.',
  '@!@!@ENDMSG 2199 @!@!@',
  '@!@!@STARTMSG 2186:0 @!@!@',
  'Finished in 6945ms at (2026-09-05 06:29:16)',
  '@!@!@ENDMSG 2186 @!@!@',
].join('\n');

test('parse success (exit 0)', () => {
  const o = parseTlcOutput(SUCCESS, 0);
  assert.equal(o.status, 'success');
  assert.equal(o.violated, undefined);
  assert.equal(o.trace, undefined);
  assert.ok(o.summary && o.summary.startsWith('completed'));
});

// ── parseTlcOutput: invariant violation (exit 12) ─────────────────────
const VIOLATED = [
  'Invariant Invariant is violated.',
  '@!@!@ENDMSG 2110 @!@!@',
  '@!@!@STARTMSG 2121:1 @!@!@',
  'The behavior up to this point is:',
  '@!@!@ENDMSG 2121 @!@!@',
  '@!@!@STARTMSG 2217:4 @!@!@',
  '1: <Initial predicate>',
  'n = 0',
  '@!@!@ENDMSG 2217 @!@!@',
  '@!@!@STARTMSG 2217:4 @!@!@',
  '2: <step line 5, col 9 to line 5, col 27 of module Broken>',
  'n = 1',
  '@!@!@ENDMSG 2217 @!@!@',
  '@!@!@STARTMSG 2217:4 @!@!@',
  '3: <step line 5, col 9 to line 5, col 27 of module Broken>',
  'n = 4',
  '@!@!@ENDMSG 2217 @!@!@',
].join('\n');

test('parse invariant violation (exit 12) extracts trace steps', () => {
  const o = parseTlcOutput(VIOLATED, 12);
  assert.equal(o.status, 'failure');
  assert.equal(o.violated, 'invariant:Invariant');
  assert.ok(o.trace, 'expected a trace');
  assert.equal(o.trace.length, 3);
  assert.equal(o.trace[0].label, 'Initial predicate');
  assert.deepEqual(o.trace[0].state, ['n = 0']);
  assert.equal(o.trace[2].state[0], 'n = 4');
});

// ── parseTlcOutput: deadlock (exit 11) ────────────────────────────────
const DEADLOCK = [
  'Deadlock reached.',
  '@!@!@ENDMSG 2114 @!@!@',
  '@!@!@STARTMSG 2121:1 @!@!@',
  'The behavior up to this point is:',
  '@!@!@ENDMSG 2121 @!@!@',
  '@!@!@STARTMSG 2217:4 @!@!@',
  '1: <Initial predicate>',
  'n = 0',
  '@!@!@ENDMSG 2217 @!@!@',
  '@!@!@STARTMSG 2217:4 @!@!@',
  '2: <step line 4, col 9 to line 4, col 23 of module Deadlock>',
  'n = 1',
  '@!@!@ENDMSG 2217 @!@!@',
].join('\n');

test('parse deadlock (exit 11) -> failure with deadlock violated + trace', () => {
  const o = parseTlcOutput(DEADLOCK, 11);
  assert.equal(o.status, 'failure');
  assert.equal(o.violated, 'deadlock');
  assert.equal(o.trace.length, 2);
  assert.equal(o.trace[1].label.startsWith('step'), true);
});

// ── parseTlcOutput: parse error (exit 150) ────────────────────────────
const PARSE_ERR = [
  'Parsing file /tmp/x/Broken.tla',
  'Semantic errors:',
  'Could not find declaration or definition of symbol \'<\'.',
  'Error: Parsing or semantic analysis failed.',
].join('\n');

test('parse error (exit 150) -> status error, no trace', () => {
  const o = parseTlcOutput(PARSE_ERR, 150);
  assert.equal(o.status, 'error');
  assert.equal(o.violated, undefined);
  assert.equal(o.trace, undefined);
});

// ── non-tool fallback: plain trace region ─────────────────────────────
test('parse failure without -tool blocks falls back to raw behavior region', () => {
  const plain = 'Invariant Invariant is violated.\nThe behavior up to this point is:\n1: <Initial predicate>\nn = 0\n2: <step>\nn = 5\n';
  const o = parseTlcOutput(plain, 12);
  assert.equal(o.status, 'failure');
  assert.equal(o.violated, 'invariant:Invariant');
  assert.ok(o.trace, 'expected trace');
  assert.ok(Array.isArray(o.trace) && o.trace[0] && o.trace[0].raw);
});

// ── buildCfg / extractModuleName ──────────────────────────────────────
test('buildCfg emits INIT/NEXT/INVARIANT/PROPERTY lines', () => {
  const cfg = buildCfg({ init: 'Init', next: 'Next', invariants: ['Invariant'], properties: ['Safety'] });
  const lines = cfg.trim().split('\n');
  assert.deepEqual(lines, ['INIT Init', 'NEXT Next', 'INVARIANT Invariant', 'PROPERTY Safety']);
});

test('buildCfg defaults to Init/Next', () => {
  assert.equal(buildCfg({}).trim(), 'INIT Init\nNEXT Next');
});

test('extractModuleName pulls MODULE name', () => {
  assert.equal(extractModuleName('---- MODULE TrafficLight ----\nEXTENDS Naturals\n===='), 'TrafficLight');
  assert.equal(extractModuleName('no module here'), null);
});