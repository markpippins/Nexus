import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEventCursor,
  clampLimit,
  clampOffset,
  parseTimeWindow,
  isAcceptableId,
} from '../src/lib/pagination.js';

describe('clampLimit', () => {
  it('defaults to 100', () => {
    assert.equal(clampLimit(null), 100);
    assert.equal(clampLimit(''), 100);
    assert.equal(clampLimit(undefined), 100);
  });
  it('caps at 500', () => {
    assert.equal(clampLimit(500), 500);
    assert.equal(clampLimit('600'), 500);
    assert.equal(clampLimit(10000), 500);
  });
  it('rejects non-positive', () => {
    assert.throws(() => clampLimit(0), /positive integer/);
    assert.throws(() => clampLimit('-3'), /positive integer/);
    assert.throws(() => clampLimit('abc'), /positive integer/);
  });
});

describe('clampOffset', () => {
  it('defaults to 0', () => {
    assert.equal(clampOffset(null), 0);
    assert.equal(clampOffset(''), 0);
  });
  it('refuses negatives and non-integers', () => {
    assert.throws(() => clampOffset(-1), /non-negative integer/);
    assert.throws(() => clampOffset('abc'), /non-negative integer/);
  });
  it('accepts any non-negative integer', () => {
    assert.equal(clampOffset(0), 0);
    assert.equal(clampOffset('123'), 123);
    assert.equal(clampOffset(5), 5);
  });
});

describe('parseEventCursor', () => {
  it('parses since + limit + offset', () => {
    const q = { since: '100', limit: '50', offset: '5' };
    const c = parseEventCursor(q);
    assert.deepEqual(c, { since: 100, limit: 50, offset: 5 });
  });
  it('rejects negative since', () => {
    assert.throws(() => parseEventCursor({ since: '-1' }), /non-negative integer/);
  });
  it('accepts empty since', () => {
    assert.deepEqual(parseEventCursor({}), { since: null, limit: 100, offset: 0 });
  });
});

describe('parseTimeWindow', () => {
  it('handles h/d/m suffix', () => {
    const h = parseTimeWindow('1h');
    const d = parseTimeWindow('1d');
    const m = parseTimeWindow('5m');
    assert.ok(h instanceof Date);
    assert.ok(d instanceof Date);
    assert.ok(m instanceof Date);
    // 1d is much earlier (further back) than 1h which is earlier than 5m
    assert.ok(d < h);
    assert.ok(h < m);
  });
  it('rejects non-duration strings', () => {
    assert.throws(() => parseTimeWindow('24'), /N<h|d|m>/);
    assert.throws(() => parseTimeWindow('abc'), /N<h|d|m>/);
    assert.throws(() => parseTimeWindow('1y'), /N<h|d|m>/);
  });
  it('rejects 0 or negative duration', () => {
    assert.throws(() => parseTimeWindow('0h'), /window length must be positive/);
    assert.throws(() => parseTimeWindow('-5h'), /N<h|d|m>/);
  });
  it('returns null when no window provided', () => {
    assert.equal(parseTimeWindow(null), null);
    assert.equal(parseTimeWindow(''), null);
  });
});

describe('isAcceptableId', () => {
  it('accepts uuids and printable text', () => {
    assert.equal(isAcceptableId('f47ac10b-58cc-4372-a567-0e02b2c3d479'), true);
    assert.equal(isAcceptableId('PLAN-0030'), true);
    assert.equal(isAcceptableId('architect'), true);
  });
  it('rejects empty / oversize / control chars / quotes', () => {
    assert.equal(isAcceptableId(''), false);
    assert.equal(isAcceptableId('a'.repeat(300)), false);
    assert.equal(isAcceptableId('a"b'), false);
    assert.equal(isAcceptableId("a'b"), false);
    assert.equal(isAcceptableId('\\x'), false);
    assert.equal(isAcceptableId('a\tb'), false);
  });
});
