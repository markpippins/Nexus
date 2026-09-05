import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { checkModel } = require('../dist/model-checker.js');

// ── Fixtures ──────────────────────────────────────────────────────────
// A simple 3-state traffic-light-like machine:
//   initial: A(red) -> B(green) -> C(yellow) -> A(red)  (cycle, no deadlock)
function cycleModel(overrides = {}) {
  return {
    states: [
      { id: 's1', name: 'Red', is_initial: true, is_terminal: false },
      { id: 's2', name: 'Green', is_initial: false, is_terminal: false },
      { id: 's3', name: 'Yellow', is_initial: false, is_terminal: false },
    ],
    transitions: [
      { id: 't1', name: 'redToGreen', from_state_id: 's1', to_state_id: 's2', guard_expression: 'TRUE' },
      { id: 't2', name: 'greenToYellow', from_state_id: 's2', to_state_id: 's3', guard_expression: 'TRUE' },
      { id: 't3', name: 'yellowToRed', from_state_id: 's3', to_state_id: 's1', guard_expression: 'TRUE' },
    ],
    invariants: [],
    properties: [],
    temporal_properties: [],
    variables: ['color'],
    constants: [],
    ...overrides,
  };
}

// ── Reachability + status ─────────────────────────────────────────────
test('cycle machine: all states reachable, no deadlock, status success', () => {
  const r = checkModel(cycleModel());
  assert.equal(r.status, 'success');
  assert.deepEqual([...r.reachableStates].sort(), ['Green', 'Red', 'Yellow'].sort());
  assert.equal(r.unreachableStates.length, 0);
  assert.equal(r.errors.length, 0);
  assert.equal(r.deadlockTrace, undefined);
});

test('missing initial state -> failure', () => {
  const r = checkModel(cycleModel({ states: cycleModel().states.map((s) => ({ ...s, is_initial: false })) }));
  assert.equal(r.status, 'failure');
  assert.ok(r.errors.some((e) => e.includes('no initial state')));
});

test('reachable non-terminal deadlock -> failure with trace path', () => {
  // Red(initial) -> Green, but Green has no outgoing and is not terminal.
  const m = cycleModel({
    transitions: [
      { id: 't1', name: 'redToGreen', from_state_id: 's1', to_state_id: 's2', guard_expression: 'TRUE' },
    ],
    states: cycleModel().states.map((s) => (s.id === 's2' ? { ...s, is_terminal: false } : s)),
  });
  const r = checkModel(m);
  assert.equal(r.status, 'failure');
  assert.ok(r.errors.some((e) => e.includes('deadlock')));
  assert.ok(r.deadlockTrace, 'expected a deadlock trace');
  assert.deepEqual(r.deadlockTrace, ['Red', 'Green']); // path initial -> deadlocked
});

test('unreachable state -> warning, still success', () => {
  const m = cycleModel({
    states: [...cycleModel().states, { id: 's4', name: 'Orphan', is_initial: false, is_terminal: false }],
  });
  const r = checkModel(m);
  assert.equal(r.status, 'success');
  assert.deepEqual(r.unreachableStates, ['Orphan']);
  assert.ok(r.warnings.some((w) => w.includes('unreachable')));
});

test('dangling transition ref -> structural error', () => {
  const m = cycleModel({
    transitions: [
      { id: 't1', name: 'bad', from_state_id: 's1', to_state_id: 's999', guard_expression: 'TRUE' },
    ],
  });
  const r = checkModel(m);
  assert.ok(r.errors.some((e) => e.includes('missing to-state')));
});

test('unguarded self-loop -> warning', () => {
  const m = cycleModel({
    transitions: [
      { id: 't1', name: 'spin', from_state_id: 's1', to_state_id: 's1', guard_expression: null },
    ],
  });
  const r = checkModel(m);
  assert.ok(r.warnings.some((w) => w.includes('self-loop')));
});

// ── Invariants ────────────────────────────────────────────────────────
test('invariant referencing only known identifiers -> PASS', () => {
  const m = cycleModel({
    invariants: [{ id: 'i1', name: 'typeInv', expression: 'color \\in {"red","green","yellow"}', is_type_invariant: true }],
  });
  const r = checkModel(m);
  const v = r.verdicts.find((x) => x.kind === 'invariant' && x.name === 'typeInv');
  assert.ok(v);
  assert.equal(v.result, 'PASS');
});

test('invariant referencing undefined identifier -> FAIL + status failure', () => {
  const m = cycleModel({
    invariants: [{ id: 'i1', name: 'badInv', expression: 'totallyUndefined = 5', is_type_invariant: false }],
  });
  const r = checkModel(m);
  const v = r.verdicts.find((x) => x.kind === 'invariant' && x.name === 'badInv');
  assert.ok(v);
  assert.equal(v.result, 'FAIL');
  assert.equal(r.status, 'failure');
});

test('empty invariant -> FAIL', () => {
  const m = cycleModel({
    invariants: [{ id: 'i1', name: 'emptyInv', expression: '', is_type_invariant: false }],
  });
  const r = checkModel(m);
  assert.equal(r.verdicts.find((x) => x.name === 'emptyInv')?.result, 'FAIL');
});

test('type invariant referencing no declared variable (only a constant) -> WARN', () => {
  const m = cycleModel({
    variables: [],
    constants: ['LIMIT'],
    invariants: [{ id: 'i1', name: 'tInv', expression: 'LIMIT > 0', is_type_invariant: true }],
  });
  const r = checkModel(m);
  assert.equal(r.verdicts.find((x) => x.name === 'tInv')?.result, 'WARN');
});

// ── Properties ────────────────────────────────────────────────────────
test('safety property referencing reachable state -> WARN (needs evaluator)', () => {
  const m = cycleModel({
    properties: [{ id: 'p1', name: 'noGreen', type: 'safety', expression: 'Green' }],
  });
  const r = checkModel(m);
  const v = r.verdicts.find((x) => x.kind === 'property' && x.name === 'noGreen');
  assert.equal(v?.result, 'WARN');
});

test('safety property referencing only unreachable state -> PASS', () => {
  const m = cycleModel({
    states: [...cycleModel().states, { id: 's4', name: 'Orphan', is_initial: false, is_terminal: false }],
    properties: [{ id: 'p1', name: 'neverOrphan', type: 'safety', expression: 'Orphan' }],
  });
  const r = checkModel(m);
  assert.equal(r.verdicts.find((x) => x.name === 'neverOrphan')?.result, 'PASS');
});

test('liveness with cycle present -> PASS', () => {
  const m = cycleModel({
    properties: [{ id: 'p1', name: 'eventually', type: 'liveness', expression: 'Green' }],
  });
  const r = checkModel(m);
  const v = r.verdicts.find((x) => x.name === 'eventually');
  assert.equal(v?.result, 'PASS');
  assert.ok(v?.detail.includes('cycle'));
});

test('liveness on deadlocked graph -> FAIL + status failure', () => {
  const m = cycleModel({
    transitions: [
      { id: 't1', name: 'redToGreen', from_state_id: 's1', to_state_id: 's2', guard_expression: 'TRUE' },
    ],
    states: cycleModel().states.map((s) => (s.id === 's2' ? { ...s, is_terminal: false } : s)),
    properties: [{ id: 'p1', name: 'eventuallyGreen', type: 'liveness', expression: 'Green' }],
  });
  const r = checkModel(m);
  assert.equal(r.verdicts.find((x) => x.name === 'eventuallyGreen')?.result, 'FAIL');
  assert.equal(r.status, 'failure');
});

test('fairness property -> PASS when a transition declares fairness', () => {
  const m = cycleModel({
    transitions: [
      { id: 't1', name: 'redToGreen', from_state_id: 's1', to_state_id: 's2', weak_fairness: true },
      { id: 't2', name: 'g2y', from_state_id: 's2', to_state_id: 's3' },
      { id: 't3', name: 'y2r', from_state_id: 's3', to_state_id: 's1' },
    ],
    properties: [{ id: 'p1', name: 'fair', type: 'fairness', expression: 'x' }],
  });
  const r = checkModel(m);
  assert.equal(r.verdicts.find((x) => x.name === 'fair')?.result, 'PASS');
});

test('fairness property -> WARN when no transition declares fairness', () => {
  const m = cycleModel({
    properties: [{ id: 'p1', name: 'fair', type: 'fairness', expression: 'x' }],
  });
  const r = checkModel(m);
  assert.equal(r.verdicts.find((x) => x.name === 'fair')?.result, 'WARN');
});

// ── Temporal properties ───────────────────────────────────────────────
test('[] always with reachable refs -> PASS', () => {
  const m = cycleModel({
    temporal_properties: [{ id: 'tp1', name: 'alwaysRed', operator: '[]', expression: 'Red' }],
  });
  assert.equal(checkModel(m).verdicts.find((x) => x.name === 'alwaysRed')?.result, 'PASS');
});

test('<> eventually referencing reachable state -> PASS', () => {
  const m = cycleModel({
    temporal_properties: [{ id: 'tp1', name: 'eventuallyGreen', operator: '<>', expression: 'Green' }],
  });
  assert.equal(checkModel(m).verdicts.find((x) => x.name === 'eventuallyGreen')?.result, 'PASS');
});

test('<> eventually referencing unreachable state -> FAIL + status failure', () => {
  const m = cycleModel({
    states: [...cycleModel().states, { id: 's4', name: 'Orphan', is_initial: false, is_terminal: false }],
    temporal_properties: [{ id: 'tp1', name: 'evOrphan', operator: '<>', expression: 'Orphan' }],
  });
  const r = checkModel(m);
  assert.equal(r.verdicts.find((x) => x.name === 'evOrphan')?.result, 'FAIL');
  assert.equal(r.status, 'failure');
});

test('-> leads-to with reachable refs -> PASS', () => {
  const m = cycleModel({
    temporal_properties: [{ id: 'tp1', name: 'leads', operator: '->', expression: 'Green' }],
  });
  assert.equal(checkModel(m).verdicts.find((x) => x.name === 'leads')?.result, 'PASS');
});