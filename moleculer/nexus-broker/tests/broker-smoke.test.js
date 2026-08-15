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

test('GET /api/solir/status responds', async () => {
  const res = await fetch(`${BASE}/solir/status`)
  assert.equal(res.status, 200)
})
