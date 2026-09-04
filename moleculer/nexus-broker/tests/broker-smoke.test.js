/**
 * nexus-broker boot smoke test — P1-1 remediation.
 *
 * Spawns the real broker (compiled dist, same path as `npm start`) on an
 * isolated port, waits for the gateway to come up, and asserts the
 * representative read paths: health, worker list, and worker actions.
 * Exercises the exact boot path systemd runs, so it fails fast if the
 * broker can no longer boot all 6 services.
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { spawn } = require('node:child_process')
const path = require('node:path')
const dotenv = require('dotenv')
const { Pool } = require('pg')
const { MongoClient } = require('mongodb')

dotenv.config({ path: path.join(__dirname, '..', '.env') })

const BROKER_DIR = path.resolve(__dirname, '..')
const TEST_PORT = process.env.TEST_SERVICE_PORT || '4098'
const BASE = `http://localhost:${TEST_PORT}/api`

let child = null

async function startBroker() {
  child = spawn(
    process.execPath,
    ['node_modules/.bin/moleculer-runner', '--mask', '**/*.js', 'dist/services'],
    {
      cwd: BROKER_DIR,
      env: { ...process.env, SERVICE_PORT: TEST_PORT, NODE_ENV: 'test' },
      // Drain output so a large projection cannot block the child on a full
      // pipe before the test reaches its assertions.
      stdio: ['ignore', 'ignore', 'ignore'],
    }
  )

  // Wait for gateway to answer /api/health (up to 30s)
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('broker did not become healthy within 30s')
}

function stopBroker() {
  return new Promise((resolve) => {
    if (!child) return resolve()
    child.on('exit', () => resolve())
    child.kill('SIGTERM')
    setTimeout(() => {
      if (child && child.exitCode === null) child.kill('SIGKILL')
      resolve()
    }, 3000)
  })
}

async function waitFor(read, description, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let lastValue
  while (Date.now() < deadline) {
    lastValue = await read()
    if (lastValue) return lastValue
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`timed out waiting for ${description}; last value: ${JSON.stringify(lastValue)}`)
}

test.before(async () => {
  await startBroker()
})

test.after(async () => {
  await stopBroker()
})

test('GET /api/health reports ok with all worker services', async () => {
  const res = await fetch(`${BASE}/health`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.status, 'ok')
  assert.equal(body.service, 'nexus-broker')
  assert.deepEqual(
    [...body.workers].sort(),
    ['worker.execution', 'worker.harness', 'worker.pty']
  )
})

test('GET /api/workers lists the 3 wave-4 workers as available', async () => {
  const res = await fetch(`${BASE}/workers`)
  assert.equal(res.status, 200)
  const body = await res.json()
  const names = body.workers.map((w) => w.name).sort()
  assert.deepEqual(names, ['worker.execution', 'worker.harness', 'worker.pty'])
  for (const w of body.workers) {
    assert.equal(w.status, 'available')
  }
})

test('GET /api/workers/harness health action responds', async () => {
  const res = await fetch(`${BASE}/workers/harness`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.status, 'ok')
})

test('GET /api/keychain-snapshot/agent-records/status exposes the active checkpoint', async () => {
  const res = await fetch(`${BASE}/keychain-snapshot/agent-records/status`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.enabled, true)
  assert.ok(Number.isInteger(body.latestSnapshot) && body.latestSnapshot > 0)
  assert.ok(Number.isInteger(body.entryCount) && body.entryCount >= 0)
  assert.ok(body.checkpointId)
})

test('replaying a delivered event is idempotent', async () => {
  const status = await (await fetch(`${BASE}/keychain-snapshot/agent-records/status`)).json()
  const transitions = await (await fetch(`${BASE}/keychain-snapshot/agent-records/transitions?limit=200`)).json()
  const delivered = transitions.items.find((item) => item.checkpoint_status === 'delivered')
  assert.ok(delivered, 'expected at least one delivered event')
  const event = delivered.trigger_event || delivered
  const res = await fetch(`${BASE}/keychain-snapshot/agent-records/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ triggerEvent: event, label: 'broker-smoke-replay' }),
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(body.deduplicated, true)
  assert.equal(body.version, status.latestSnapshot)
})

test('negative outcomes are archived without advancing the checkpoint', async () => {
  const before = await (await fetch(`${BASE}/keychain-snapshot/agent-records/status`)).json()
  const eventId = `broker-smoke-refused-${Date.now()}`
  const res = await fetch(`${BASE}/keychain-snapshot/agent-records/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ triggerEvent: {
      source_namespace: 'broker-smoke',
      source_event_id: eventId,
      kind: 'verification.decision.refused',
      outcome: 'refused',
      actor: 'broker-smoke',
    } }),
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.archived, true)
  assert.equal(body.checkpoint_created, false)
  const after = await (await fetch(`${BASE}/keychain-snapshot/agent-records/status`)).json()
  assert.equal(after.latestSnapshot, before.latestSnapshot)
  assert.equal(after.checkpointId, before.checkpointId)
})

test('rewind returns a committed state vector and rejects invalid versions', async () => {
  const status = await (await fetch(`${BASE}/keychain-snapshot/agent-records/status`)).json()
  const rewind = await (await fetch(`${BASE}/keychain-snapshot/agent-records/rewind?at=${status.latestSnapshot}`)).json()
  assert.equal(rewind.ok, true)
  assert.equal(rewind.version, status.latestSnapshot)
  assert.ok(rewind.state_vector)
  assert.ok(rewind.recordTypeCount > 0)

  const invalid = await (await fetch(`${BASE}/keychain-snapshot/agent-records/rewind?at=0`)).json()
  assert.equal(invalid.ok, false)
})

test('decision checkpoint preserves owner, authorization, and evaluator read-set provenance', async () => {
  const sourceNamespace = `keychains-read-set-${process.pid}-${Date.now()}`
  const sourceEventId = randomUUID()
  const triggerEvent = {
    source_namespace: sourceNamespace,
    source_event_id: sourceEventId,
    kind: 'peb.deny_contract_promotion.committed',
    outcome: 'committed',
    actor: 'peb-kernel',
    decision_class: 'deny_contract_promotion',
    binding_owner: 'resolution',
    authority_level: 'narrowly_binding',
    authorization_ref: '986ec482',
    evaluator_id: 'peb-evaluator',
    evaluator_version: 'peb-evaluator-v1',
    contract_id: 'governed-trigger.v1',
    contract_version: 1,
    law_id: 'deny-contract-promotion-law',
    law_version: '2026-09-02',
    bridge_id: 'resolution-keychains-bridge',
    bridge_version: '1',
    read_set: {
      manifest_id: 'keychains-read-set-manifest-v1',
      digest: 'sha256:keychains-read-set-test',
      source_revision: 'test-revision-1',
    },
    payload: { decision: 'committed' },
  }
  const mongo = new MongoClient(process.env.MONGO_URL || 'mongodb://localhost:27017')
  let checkpointId = null
  let previousActive = null
  let previousEntries = null
  let previousRecordTypeState = null

  try {
    await mongo.connect()
    const db = mongo.db('keychains')
    previousActive = await db.collection('active_checkpoints').findOne({ _id: 'agent-records' })
    previousEntries = await db.collection('entries').find({}).toArray()
    previousRecordTypeState = await db.collection('record_type_state').find({}).toArray()

    const res = await fetch(`${BASE}/keychain-snapshot/agent-records/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggerEvent }),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.ok, true)
    assert.equal(body.deduplicated, false)
    assert.deepEqual(body.decision_context, {
      schema_version: 1,
      checkpoint_class: 'decision',
      decision_class: 'deny_contract_promotion',
      source_namespace: sourceNamespace,
      source_event_id: sourceEventId,
      binding_decision_owner: {
        role: 'resolution',
        authority_level: 'narrowly_binding',
        authorization_ref: '986ec482',
      },
      evaluator: { id: 'peb-evaluator', version: 'peb-evaluator-v1' },
      contract: { id: 'governed-trigger.v1', version: 1 },
      law: { id: 'deny-contract-promotion-law', version: '2026-09-02' },
      bridge: { id: 'resolution-keychains-bridge', version: '1' },
      source_read_set: triggerEvent.read_set,
      read_set_manifest: {
        manifest_id: 'keychains-read-set-manifest-v1',
        digest: 'sha256:keychains-read-set-test',
      },
    })

    checkpointId = body.trigger && body.trigger.checkpoint_id
    const rewind = await (await fetch(`${BASE}/keychain-snapshot/agent-records/rewind?at=${body.version}`)).json()
    assert.equal(rewind.ok, true)
    assert.deepEqual(rewind.decision_context, body.decision_context)

    const transitions = await (await fetch(`${BASE}/keychain-snapshot/agent-records/transitions?limit=200`)).json()
    const transition = transitions.items.find((item) => item.source_namespace === sourceNamespace)
    assert.ok(transition)
    assert.deepEqual(transition.read_set, triggerEvent.read_set)
    assert.equal(transition.checkpoint_status, 'delivered')
  } finally {
    const db = mongo.db('keychains')
    if (!checkpointId) {
      const checkpoint = await db.collection('ar_snapshots').findOne({
        source_namespace: sourceNamespace,
        source_event_id: sourceEventId,
      })
      checkpointId = checkpoint?.checkpoint_id || null
    }
    await db.collection('transitions').deleteMany({
      $or: [
        { source_namespace: sourceNamespace },
        { keychain_event_id: `${sourceNamespace}:${sourceEventId}` },
      ],
    })
    await db.collection('ar_drift_findings').deleteMany({ checkpoint_id: checkpointId })
    await db.collection('checkpoint_entries').deleteMany({ checkpoint_id: checkpointId })
    await db.collection('ar_snapshots').deleteMany({
      source_namespace: sourceNamespace,
      source_event_id: sourceEventId,
    })
    if (previousActive) {
      await db.collection('active_checkpoints').replaceOne(
        { _id: 'agent-records' },
        previousActive,
        { upsert: true },
      )
    } else {
      await db.collection('active_checkpoints').deleteOne({ _id: 'agent-records' })
    }
    if (previousEntries) {
      await db.collection('entries').deleteMany({})
      if (previousEntries.length > 0) await db.collection('entries').insertMany(previousEntries)
    }
    if (previousRecordTypeState) {
      await db.collection('record_type_state').deleteMany({})
      if (previousRecordTypeState.length > 0) await db.collection('record_type_state').insertMany(previousRecordTypeState)
    }
    await mongo.close()
  }
})

test('SOL outbox events are delivered into Keychains and replayed idempotently', async () => {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER || 'pguser',
    password: process.env.PG_PASSWORD || 'pgpass',
    database: 'sol',
  })
  const sourceNamespace = `sol-e2e-${process.pid}-${Date.now()}`
  const sourceEventId = randomUUID()
  const eventKind = 'sol.e2e.transition.committed'
  const payload = { test_run: sourceNamespace, decision: 'committed' }
  const readSet = { manifest_id: 'sol-e2e-manifest-v1', digest: 'sha256:test-only' }

  try {
    await pool.query(
      `INSERT INTO resolution.keychain_event_outbox
         (source_namespace, source_event_id, event_kind, outcome, actor, read_set, payload)
       VALUES ($1, $2, $3, 'committed', $4, $5::jsonb, $6::jsonb)`,
      [sourceNamespace, sourceEventId, eventKind, 'broker-smoke', JSON.stringify(readSet), JSON.stringify(payload)],
    )

    const delivered = await waitFor(async () => {
      const result = await pool.query(
        `SELECT source_namespace, source_event_id, checkpoint_status, delivery_attempts
           FROM resolution.keychain_event_outbox
          WHERE source_namespace = $1 AND source_event_id = $2`,
        [sourceNamespace, sourceEventId],
      )
      return result.rows[0]?.checkpoint_status === 'delivered' ? result.rows[0] : null
    }, 'SOL outbox delivery')
    assert.equal(delivered.source_namespace, sourceNamespace)
    assert.equal(delivered.source_event_id, sourceEventId)
    assert.ok(delivered.delivery_attempts >= 1)

    const transition = await waitFor(async () => {
      const result = await (await fetch(`${BASE}/keychain-snapshot/agent-records/transitions?limit=200`)).json()
      return result.items.find((item) =>
        item.source_namespace === sourceNamespace && item.source_event_id === sourceEventId,
      )
    }, 'SOL Keychains transition')
    assert.equal(transition.checkpoint_status, 'delivered')
    assert.equal(transition.kind, eventKind)
    assert.equal(transition.source_namespace, sourceNamespace)
    assert.equal(transition.source_event_id, sourceEventId)
    assert.ok(Number.isInteger(transition.snapshot_version))
    assert.ok(transition.checkpoint_id)
    assert.deepEqual(transition.payload, payload)
    assert.deepEqual(transition.read_set, readSet)

    const replay = await fetch(`${BASE}/keychain-snapshot/agent-records/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        triggerEvent: {
          source_namespace: sourceNamespace,
          source_event_id: sourceEventId,
          kind: eventKind,
          outcome: 'committed',
          actor: 'broker-smoke-replay',
          payload,
          read_set: readSet,
        },
      }),
    })
    assert.equal(replay.status, 200)
    const replayBody = await replay.json()
    assert.equal(replayBody.ok, true)
    assert.equal(replayBody.deduplicated, true)
    assert.equal(replayBody.version, transition.snapshot_version)

    const concurrentReplays = await Promise.all([
      fetch(`${BASE}/keychain-snapshot/agent-records/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerEvent: {
          source_namespace: sourceNamespace,
          source_event_id: sourceEventId,
          kind: eventKind,
          outcome: 'committed',
        } }),
      }),
      fetch(`${BASE}/keychain-snapshot/agent-records/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerEvent: {
          source_namespace: sourceNamespace,
          source_event_id: sourceEventId,
          kind: eventKind,
          outcome: 'committed',
        } }),
      }),
    ])
    const concurrentBodies = await Promise.all(concurrentReplays.map(async (response) => {
      assert.equal(response.status, 200)
      return response.json()
    }))
    assert.ok(concurrentBodies.every((body) => body.ok && body.deduplicated))
    assert.ok(concurrentBodies.every((body) => body.version === transition.snapshot_version))

    const afterReplay = await pool.query(
      `SELECT checkpoint_status, delivery_attempts
         FROM resolution.keychain_event_outbox
        WHERE source_namespace = $1 AND source_event_id = $2`,
      [sourceNamespace, sourceEventId],
    )
    assert.equal(afterReplay.rows[0].checkpoint_status, 'delivered')
    assert.equal(afterReplay.rows[0].delivery_attempts, delivered.delivery_attempts)
  } finally {
    await pool.query(
      `DELETE FROM resolution.keychain_event_outbox
        WHERE source_namespace = $1 AND source_event_id = $2`,
      [sourceNamespace, sourceEventId],
    )
    await pool.end()
  }
})
