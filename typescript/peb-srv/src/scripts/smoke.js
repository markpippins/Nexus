#!/usr/bin/env node
// Ping the peb-srv API running locally to verify every endpoint group.
// Usage: node src/scripts/smoke.js [BASE_URL]
import assert from 'node:assert/strict';

const BASE = process.argv[2] || `http://localhost:${process.env.PEB_SRV_PORT || 3111}`;

async function req(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: r.status, json };
}

async function main() {
  console.log(`[smoke] base=${BASE}`);

  // Group 1: root health
  {
    const { status, json } = await req('GET', '/health');
    assert.equal(status, 200, `health: ${status} ${JSON.stringify(json)}`);
    console.log(`[smoke] GET /health ok ->`, json);
  }

  // Group 1: event stream — list + filters
  {
    const { status, json } = await req('GET', '/api/peb/events?limit=5');
    assert.equal(status, 200, `events: ${status} ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(json.events), 'events ok');
    assert.equal(json.limit, 5);
    console.log(`[smoke] GET /api/peb/events?limit=5 -> ${json.events.length} rows`);
    if (json.events.length > 0) {
      console.log(`        first receipt_id=${json.events[0].receipt_id ?? '?'} type=${json.events[0].event_type}`);
    }
  }

  // Fetch a single event by receipt_id
  let receiptId = null, planId = null, agentRole = null;
  {
    const list = await req('GET', '/api/peb/events?limit=1');
    if (list.json.events && list.json.events.length > 0) {
      receiptId  = list.json.events[0].receipt_id;
      planId     = list.json.events[0].plan_id;
      agentRole = list.json.events[0].agent_role;
      const { status, json } = await req('GET', `/api/peb/events/${encodeURIComponent(receiptId)}`);
      assert.equal(status, 200, `events/{id}: ${status} ${JSON.stringify(json)}`);
      console.log(`[smoke] GET /api/peb/events/${receiptId} -> ${json.event.event_type}`);
    } else {
      console.log(`[smoke] SKIP /api/peb/events/{id} (no events present)`);
    }
  }

  // Filter by agent_role / plan_id / work_request_id
  if (agentRole) {
    const { status, json } = await req('GET', `/api/peb/events?agent_role=${encodeURIComponent(agentRole)}&limit=3`);
    assert.equal(status, 200);
    for (const ev of json.events) {
      assert.equal(ev.agent_role, agentRole, 'agent_role filter not applied');
    }
    console.log(`[smoke] GET /api/peb/events?agent_role=${agentRole} -> ${json.events.length} filtered rows`);
  }

  // NotFound path
  {
    const { status, json } = await req('GET', '/api/peb/events/THIS_RECEIPT_DOES_NOT_EXIST');
    assert.equal(status, 404, `events/{missing} expected 404, got ${status} ${JSON.stringify(json)}`);
    console.log(`[smoke] GET /api/peb/events/<missing> -> 404 ok`);
  }

  // Group 1: transactions
  let txId = null, entityId = null;
  {
    const { status, json } = await req('GET', '/api/peb/transactions?limit=3');
    assert.equal(status, 200, `tx: ${status} ${JSON.stringify(json)}`);
    console.log(`[smoke] GET /api/peb/transactions?limit=3 -> ${json.transactions.length} rows`);
    if (json.transactions.length > 0) {
      txId = json.transactions[0].id;
      entityId = json.transactions[0].entity_id;
      const one = await req('GET', `/api/peb/transactions/${txId}`);
      assert.equal(one.status, 200);
      assert.equal(one.json.transaction.id, txId);
      console.log(`[smoke] GET /api/peb/transactions/${txId} -> ${one.json.transaction.entity_id}:${one.json.transaction.tool_name}`);

      // Lineage
      const lin = await req('GET', `/api/peb/transactions/${txId}/lineage`);
      assert.equal(lin.status, 200, `lineage: ${lin.status} ${JSON.stringify(lin.json)}`);
      assert.ok(lin.json.transaction, 'lineage.transaction');
      console.log(`[smoke] GET /api/peb/transactions/${txId}/lineage ->` +
                  ` decisions=${lin.json.decisions.length}` +
                  ` decision_chain=${lin.json.decision_chain.length}` +
                  ` traces=${lin.json.traces.length}` +
                  ` violations=${lin.json.violations.length}` +
                  ` governance_events=${lin.json.governance_events.length}`);
    } else {
      console.log(`[smoke] SKIP /api/peb/transactions/{id}/lineage (no transactions present)`);
    }
  }

  // Group 1: transactions filter
  if (txId) {
    const { status, json } = await req('GET', `/api/peb/transactions?tool_name=peb_validate_transition&limit=5`);
    assert.equal(status, 200);
    if (json.transactions.length > 0) {
      for (const t of json.transactions) assert.equal(t.tool_name, 'peb_validate_transition');
    }
    console.log(`[smoke] GET /api/peb/transactions?tool_name=peb_validate_transition -> ${json.transactions.length}`);
  }

  // Group 3: fleet health
  {
    const cb = await req('GET', '/api/peb/health/circuit-breakers');
    assert.equal(cb.status, 200, `cb: ${cb.status} ${JSON.stringify(cb.json)}`);
    assert.ok(Array.isArray(cb.json.circuit_breakers));
    console.log(`[smoke] GET /api/peb/health/circuit-breakers -> ${cb.json.circuit_breakers.length} rows`);
  }
  {
    const vs = await req('GET', '/api/peb/health/violations/summary?window=30d&group_by=severity');
    assert.equal(vs.status, 200, `vs: ${vs.status} ${JSON.stringify(vs.json)}`);
    console.log(`[smoke] GET /api/peb/health/violations/summary?group_by=severity -> ${vs.json.summary.length} keys`);
  }
  {
    const en = await req('GET', '/api/peb/health/entropy?group_by=entropy_class&window=90d');
    assert.equal(en.status, 200, `en: ${en.status} ${JSON.stringify(en.json)}`);
    console.log(`[smoke] GET /api/peb/health/entropy?group_by=entropy_class -> ${en.json.summary.length} keys, ${en.json.trend.length} trend rows`);
  }

  // Group 1: event stream cursor pagination
  {
    const p1 = await req('GET', '/api/peb/events?limit=10');
    assert.equal(p1.status, 200);
    if (p1.json.events.length === 10 && p1.json.next_cursor != null) {
      const p2 = await req('GET', `/api/peb/events?limit=10&since=${p1.json.next_cursor}`);
      assert.equal(p2.status, 200);
      // Ideally p2 doesn't overlap with p1.
      if (p2.json.events.length > 0) {
        assert.ok(p2.json.events[0].id > p1.json.events[p1.json.events.length - 1].id,
                  `cursor retraced: p1 ends at ${p1.json.events[p1.json.events.length - 1].id}, p2 starts at ${p2.json.events[0].id}`);
        console.log(`[smoke] cursor pagination: p1 last=${p1.json.events[p1.json.events.length - 1].id}, p2 first=${p2.json.events[0].id}`);
      } else {
        console.log(`[smoke] cursor pagination: p1 produced 10 results; p2 produced 0 (end of stream)`);
      }
    } else {
      console.log(`[smoke] cursor pagination: not enough events for 2 pages (${p1.json.events.length})`);
    }
  }

  // Group 1: replay (no-op if no events in DB; should refuse unknown receipt)
  {
    const r = await req('POST', '/api/peb/events/UNKNOWN_RECEIPT/replay');
    assert.equal(r.status, 404, `replay(unknown): ${r.status} ${JSON.stringify(r.json)}`);
    console.log(`[smoke] POST /api/peb/events/<unknown>/replay -> 404 ok`);
  }
  if (receiptId) {
    const r = await req('POST', `/api/peb/events/${encodeURIComponent(receiptId)}/replay`);
    assert.equal(r.status, 200, `replay: ${r.status} ${JSON.stringify(r.json)}`);
    assert.ok(r.json.replayed.replayed_at, 'replay stamp');
    console.log(`[smoke] POST /api/peb/events/${receiptId}/replay -> replayed_at set`);
    // Replay again; allowed (idempotent — just bumps the timestamp)
    const r2 = await req('POST', `/api/peb/events/${encodeURIComponent(receiptId)}/replay`);
    assert.equal(r2.status, 200);
    console.log(`[smoke] POST /api/peb/events/${receiptId}/replay (idempotent) -> replayed_at bumped`);
  }

  // Group 2: capability-gap (real entity_id)
  if (entityId) {
    const cg = await req('GET', `/api/peb/entities/${encodeURIComponent(entityId)}/capability-gap?limit=50`);
    assert.equal(cg.status, 200, `cap-gap: ${cg.status} ${JSON.stringify(cg.json)}`);
    assert.ok(cg.json.summary, 'cap-gap summary');
    console.log(`[smoke] GET /api/peb/entities/${entityId}/capability-gap ->`, cg.json.summary);
  }
  {
    const r = await req('GET', '/api/peb/entities/ENTITY_DOES_NOT_EXIST/capability-gap');
    assert.equal(r.status, 200);
    assert.equal(r.json.capability_gaps.length, 0);
    console.log(`[smoke] GET /api/peb/entities/<missing>/capability-gap -> empty`);
  }

  // Group 4: state versions & diff -- no state rows exist; both should gracefully empty
  {
    const v = await req('GET', '/api/peb/state/NO_SUCH_KEY/versions');
    assert.equal(v.status, 200, `state-versions: ${v.status} ${JSON.stringify(v.json)}`);
    assert.equal(v.json.historical_versions.length, 0);
    console.log(`[smoke] GET /api/peb/state/<none>/versions -> empty`);
  }
  {
    const d = await req('GET', '/api/peb/state/NO_SUCH_KEY/diff?from=NO_SF&to=current');
    assert.equal(d.status, 404, `state-diff(missing): ${d.status} ${JSON.stringify(d.json)}`);
    console.log('[smoke] GET /api/peb/state/<none>/diff -> 404 (no tx touch)');
  }

  // Group 5: SSE stream -- open the connection, request /events/stream, expect
  // 'ready' as first message, then close the connection (sim client disconnect).
  {
    const ctrl = new AbortController();
    const resp = await fetch(`${BASE}/api/peb/events/stream?limit=1`, {
      signal: ctrl.signal,
      headers: { Accept: 'text/event-stream' },
    });
    assert.equal(resp.status, 200);
    assert.equal(resp.headers.get('content-type'), 'text/event-stream');
    const reader = resp.body.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    assert.match(text, /^event: ready/m, `first SSE message is 'ready': ${text.slice(0,200)}`);
    console.log(`[smoke] SSE /api/peb/events/stream -> ready received`);
    ctrl.abort();
    try { await reader.read(); } catch (_) {}
  }

  console.log('\n[smoke] ALL CHECKS PASSED');
}

main().catch((err) => {
  console.error('[smoke] FAILED:', err);
  process.exit(1);
});
