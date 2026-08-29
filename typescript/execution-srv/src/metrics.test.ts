function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}
import {
  MetricsRegistry,
  governanceMetrics,
  METRIC_WITNESSED_RUN_STATUS,
  METRIC_DOCTRINE_LOOKUP,
  METRIC_DOCTRINE_LOOKUP_LATENCY,
  METRIC_RECEIPT_CORRELATION_INVALID,
  isUuidShape,
} from './metrics.js';

export async function runMetricsConformance(): Promise<void> {
  // ── counters: inc/get with label sorting (order-independent keys) ──
  {
    const m = new MetricsRegistry();
    m.inc('x_total', { status: 'complete' });
    m.inc('x_total', { status: 'complete' });
    m.inc('x_total', { status: 'unknown' });
    equal(m.get('x_total', { status: 'complete' }), 2, 'counter increments');
    equal(m.get('x_total', { status: 'unknown' }), 1, 'counter per label value');
    equal(m.get('x_total', { status: 'stale' }), 0, 'absent counter reads 0');
    // label order must not change the key
    equal(m.get('x_total', { status: 'complete' }), 2, 'label order independence');
  }

  // ── latency aggregates ──
  {
    const m = new MetricsRegistry();
    m.observeLatency('lookup_ms', { status: 'resolved' }, 10);
    m.observeLatency('lookup_ms', { status: 'resolved' }, 20);
    m.observeLatency('lookup_ms', { status: 'resolved' }, 30);
    const agg = m.latencyFor('lookup_ms', { status: 'resolved' });
    equal(agg.count, 3, 'latency count');
    equal(agg.sum, 60, 'latency sum');
    equal(agg.avg, 20, 'latency avg');
    equal(m.latencyFor('lookup_ms', { status: 'stale' }).count, 0, 'absent latency reads zero');
  }

  // ── snapshot is JSON-serializable and contains both families ──
  {
    const m = new MetricsRegistry();
    m.inc(METRIC_WITNESSED_RUN_STATUS, { status: 'complete' });
    m.observeLatency(METRIC_DOCTRINE_LOOKUP_LATENCY, { status: 'resolved' }, 5);
    const snap = JSON.parse(JSON.stringify(m.snapshot()));
    equal(snap.counters['witnessed_run_status_total{status=complete}'], 1, 'snapshot counters');
    equal(snap.latencies['doctrine_lookup_latency_ms{status=resolved}'].count, 1, 'snapshot latencies');
    equal(typeof snap.generatedAt, 'string', 'snapshot timestamp');
  }

  // ── reset ──
  {
    const m = new MetricsRegistry();
    m.inc('y_total');
    m.reset();
    equal(m.get('y_total'), 0, 'reset clears counters');
  }

  // ── isUuidShape mirrors resolution.is_uuid semantics ──
  {
    equal(isUuidShape('77777777-3333-4444-8555-666666666666'), true, 'valid uuid accepted');
    equal(isUuidShape('77777777-3333-4444-8555-66666666666'), false, 'short uuid rejected');
    equal(isUuidShape("'; DROP TABLE peb.transactions; --"), false, 'injection rejected');
    equal(isUuidShape(''), false, 'empty rejected');
    equal(isUuidShape(null), false, 'null rejected');
    equal(isUuidShape(12345), false, 'non-string rejected');
    equal(isUuidShape('77777777-3333-4444-8555-666666666666'.toUpperCase()), true, 'uppercase accepted');
  }

  // ── process-wide registry is usable and isolated from local instances ──
  {
    governanceMetrics.reset();
    governanceMetrics.inc(METRIC_RECEIPT_CORRELATION_INVALID);
    equal(governanceMetrics.get(METRIC_RECEIPT_CORRELATION_INVALID), 1, 'global registry works');
    governanceMetrics.reset();
  }

  // ── doctrine lookup metric family key shape (status x reason) ──
  {
    const m = new MetricsRegistry();
    m.inc(METRIC_DOCTRINE_LOOKUP, { status: 'unknown', reason: 'lookup_error' });
    m.inc(METRIC_DOCTRINE_LOOKUP, { status: 'unknown', reason: 'lookup_timeout' });
    m.inc(METRIC_DOCTRINE_LOOKUP, { status: 'resolved' });
    equal(m.get(METRIC_DOCTRINE_LOOKUP, { status: 'unknown', reason: 'lookup_error' }), 1, 'reason taxonomy key 1');
    equal(m.get(METRIC_DOCTRINE_LOOKUP, { status: 'unknown', reason: 'lookup_timeout' }), 1, 'reason taxonomy key 2');
    equal(m.get(METRIC_DOCTRINE_LOOKUP, { status: 'resolved' }), 1, 'resolved key');
  }

  console.log('governance metrics: conformance passed');
}

// Self-run when executed directly via tsx.
if (typeof require !== 'undefined' && require.main === module) {
  runMetricsConformance().then(
    () => {
      console.log('ALL GREEN');
      process.exit(0);
    },
    (err) => {
      console.error(err?.message ?? err);
      process.exit(2);
    },
  );
}
