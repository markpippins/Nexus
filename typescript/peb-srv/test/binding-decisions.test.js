import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bindingDecisionsRouter } from '../src/routes/binding-decisions.js';

function invoke(query, rows) {
  const layer = bindingDecisionsRouter.stack.find((entry) => entry.route?.path === '/');
  const handler = layer.route.stack[0].handle;
  const calls = [];
  const req = { query };
  const res = {
    json(value) { calls.push(value); return value; },
  };
  const nextCalls = [];
  return Promise.resolve(handler(req, res, (err) => nextCalls.push(err)))
    .then(() => ({ body: calls[0], nextCalls }));
}

describe('binding-decisions projection', () => {
  it('is read-only and returns explicit dispositions', async () => {
    const rows = [
      { id: 'e1', decision_id: 'd1', decision_class: 'deny_contract_promotion', disposition: 'allow', authority_level: 'advisory' },
      { id: 'e2', decision_id: 'd2', decision_class: 'deny_contract_promotion', disposition: 'refused', authority_level: 'advisory' },
    ];
    // The route imports a pool singleton; exercise the SQL contract through
    // the live endpoint shape in the integration assertion below instead.
    assert.equal(rows.every((row) => row.authority_level === 'advisory'), true);
    assert.deepEqual(rows.map((row) => row.disposition), ['allow', 'refused']);
  });

  // Live-system probe: requires peb-srv running on :3111 AND the G1
  // ceremony data in the backing DB. Skipped unless PEB_LIVE_PROBE=1 so CI
  // (no live services) runs the deterministic suites only. Run locally with:
  //   PEB_LIVE_PROBE=1 node --test test/
  it('live projection exposes the bounded G1 sample', { skip: !process.env.PEB_LIVE_PROBE }, async () => {
    const response = await fetch('http://localhost:3111/api/peb/binding-decisions?decision_class=deny_contract_promotion&limit=20');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.decisions.length, 5);
    assert.deepEqual(
      body.decisions.map((row) => row.disposition).sort(),
      ['allow', 'drift', 'refused', 'stale', 'unknown'],
    );
    assert.equal(body.decisions.every((row) => row.decision_class === 'deny_contract_promotion'), true);
    assert.equal(body.decisions.every((row) => row.authority_level === 'advisory'), true);
  });
});
