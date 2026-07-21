import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatSseMessage, PEB_EVENTS } from '../src/lib/sse-bus.js';

describe('formatSseMessage', () => {
  it('formats a ready event', () => {
    const out = formatSseMessage({ type: 'ready', payload: { connected: true } });
    assert.match(out, /^event: ready\ndata: \{"connected":true\}\n\n$/);
  });
  it('passes through arbitrary payloads as JSON', () => {
    const out = formatSseMessage({ type: 'PLAN_BLOCK', payload: { plan_id: '0053', reason: 'circuit' } });
    assert.match(out, /event: PLAN_BLOCK/);
    assert.match(out, /"plan_id":"0053"/);
    assert.match(out, /"reason":"circuit"/);
  });
  it('handles undefined payloads as empty object', () => {
    const out = formatSseMessage({ type: 'noop' });
    assert.match(out, /event: noop\ndata: \{\}\n\n/);
  });
  it('uses the documented SSE format (event, data, blank line)', () => {
    const out = formatSseMessage({ type: 'event', payload: { x: 1 } });
    assert.ok(out.endsWith('\n\n'));
    assert.ok(out.startsWith('event: event\n'));
  });
});

describe('PEB_EVENTS constant', () => {
  it('is the symbolic bus name', () => {
    assert.equal(typeof PEB_EVENTS, 'string');
    assert.equal(PEB_EVENTS, 'peb:event');
  });
});
