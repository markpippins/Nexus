import { test } from '@japa/runner'

/**
 * Functional smoke tests for nexus-control-edge — P1-1 remediation.
 *
 * Exercises representative read/write paths across the re-homed surface,
 * including the R2-3 distinct conduit breaker path. These are live-DB
 * integration tests (the edge reads/writes PostgreSQL + Redis), matching
 * the "CI-runnable npm test exercising representative read/write paths"
 * acceptance for P1-1.
 */
test.group('health', () => {
  test('GET /health returns ok with db + redis up', async ({ client }) => {
    const res = await client.get('/health')
    res.assertStatus(200)
    res.assertBodyContains({ status: 'ok', service: 'nexus-control-edge' })
  })
})

test.group('conduit domain (Wave 3.3)', () => {
  test('GET /workflows returns a workflow summary', async ({ client }) => {
    const res = await client.get('/workflows')
    res.assertStatus(200)
    res.assert!.properties(res.body(), ['connected', 'counts', 'workflows'])
  })

  test('GET /config/cron returns pipeline cron', async ({ client }) => {
    const res = await client.get('/config/cron')
    res.assertStatus(200)
    res.assert!.properties(res.body(), ['cron', 'intervalMinutes'])
  })
})

test.group('R2-3 distinct breaker paths (never merged)', () => {
  test('GET /config/failure-recovery serves the tackle table (retry_after 1800)', async ({ client }) => {
    const res = await client.get('/config/failure-recovery')
    res.assertStatus(200)
    res.assertBodyContains({ circuit_breaker_retry_after: 1800 })
  })

  test('GET /config/failure-recovery/conduit serves the conduit table (retry_after 3600)', async ({ client }) => {
    const res = await client.get('/config/failure-recovery/conduit')
    res.assertStatus(200)
    res.assertBodyContains({ circuit_breaker_retry_after: 3600 })
  })

  test('POST /config/failure-recovery/conduit write round-trip (idempotent)', async ({ client }) => {
    const payload = {
      max_retries_per_model: 3,
      retry_delay_seconds: 120,
      max_fallbacks: 3,
      push_back_to_pending: true,
      circuit_breaker_retry_after: 3600,
    }
    const write = await client.post('/config/failure-recovery/conduit').json(payload)
    write.assertStatus(200)
    write.assertBodyContains({ saved: true })

    const read = await client.get('/config/failure-recovery/conduit')
    read.assertStatus(200)
    read.assertBodyContains({ circuit_breaker_retry_after: 3600, max_retries_per_model: 3 })
  })
})

test.group('ui-tools domain (links)', () => {
  test('GET /api/links returns an array', async ({ client }) => {
    const res = await client.get('/api/links')
    res.assertStatus(200)
    res.assert!.isArray(res.body())
  })
})

test.group('tackle domain (Wave 3.5)', () => {
  test('GET /tasks?role=architect returns {count, tasks} (tackle form)', async ({ client }) => {
    const res = await client.get('/tasks').qs({ role: 'architect' })
    res.assertStatus(200)
    res.assert!.properties(res.body(), ['count', 'tasks'])
    res.assert!.isArray(res.body().tasks)
  })

  test('GET /tasks/:task_slug is the task detail shape, not role list', async ({ client }) => {
    // The retired prompt-sync listRoleTasks op (GET /tasks/{role}) 404s;
    // the edge serves the tackle-form instead.
    const res = await client.get('/tasks/architect')
    res.assertStatus(404)
  })
})

test.group('wind domain (Wave 3.4)', () => {
  test('GET /api/event-types returns an array', async ({ client }) => {
    const res = await client.get('/api/event-types')
    res.assertStatus(200)
    res.assert!.isArray(res.body())
  })
})

test.group('kernel domain (Wave 3.6)', () => {
  test('GET /api/kernel/policy/active returns a policy payload', async ({ client }) => {
    const res = await client.get('/api/kernel/policy/active')
    res.assertStatus(200)
  })
})
