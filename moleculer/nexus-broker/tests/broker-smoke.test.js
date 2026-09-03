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
const { spawn } = require('node:child_process')
const path = require('node:path')

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
      stdio: ['ignore', 'pipe', 'pipe'],
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
  const transitions = await (await fetch(`${BASE}/keychain-snapshot/agent-records/transitions?limit=50`)).json()
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
