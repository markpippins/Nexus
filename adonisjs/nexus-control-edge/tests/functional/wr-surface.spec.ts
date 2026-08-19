import { test } from '@japa/runner'

/**
 * P1-1 depth — behavioral tests for the vision WR / receipt surface.
 *
 * Extends the boot smoke spec (tests/functional/smoke.spec.ts) with
 * behavioral coverage beyond method/path checks:
 *
 *   - POST /vision/work-requests — write path: create → read-back, and the
 *     ON CONFLICT upsert idempotency (same wr_id → action 'updated').
 *   - GET /vision/work-requests — status filter + limit contract.
 *   - GET /vision/work-requests/:id — read-back and 404 for unknown ids.
 *   - GET /vision/receipts — planId-scoped read; 400 when planId missing.
 *   - GET /wr/drift-scan — read path returning {scanned, drifted, findings}.
 *
 * Live-DB integration (the edge reads/writes PostgreSQL), same as smoke.spec.ts.
 * Uses a namespaced test wr_id so repeated runs stay idempotent.
 */
const TEST_WR_ID = `wr-test-p11-${process.env.TEST_WR_ID_SUFFIX || 'local'}`

test.group('vision work-request write path (P1-1 depth)', () => {
  test('POST /vision/work-requests creates a WR and returns ok', async ({ client }) => {
    const res = await client.post('/vision/work-requests').json({
      id: TEST_WR_ID,
      work_request_uuid: `workrequest:${TEST_WR_ID}`,
      dco_json: JSON.stringify({ intent: { type: 'recon', objective: 'p11-depth-test' } }),
      context: { test: true },
      status: 'pending',
      title: 'P1-1 depth test WR',
    })
    res.assertStatus(200)
    res.assertBodyContains({ ok: true, id: TEST_WR_ID, action: 'created' })
  })

  test('POST same wr_id is an idempotent upsert (action updated)', async ({ client }) => {
    const res = await client.post('/vision/work-requests').json({
      id: TEST_WR_ID,
      status: 'validated',
      title: 'P1-1 depth test WR (updated)',
    })
    res.assertStatus(200)
    res.assertBodyContains({ ok: true, id: TEST_WR_ID, action: 'updated' })
  })

  test('POST without id is rejected 400', async ({ client }) => {
    const res = await client.post('/vision/work-requests').json({ status: 'pending' })
    res.assertStatus(400)
    res.assertBodyContains({ ok: false })
  })
})

test.group('vision work-request read path (P1-1 depth)', () => {
  test('GET /vision/work-requests/:id returns the created WR', async ({ client }) => {
    const res = await client.get(`/vision/work-requests/${TEST_WR_ID}`)
    res.assertStatus(200)
    res.assert!.properties(res.body().work_request, [
      'id', 'wr_id', 'work_request_uuid', 'dco_json', 'context', 'status', 'title', 'updated_at',
    ])
    res.assert!.equal(res.body().work_request.wr_id, TEST_WR_ID)
  })

  test('GET /vision/work-requests/:id returns 404 for unknown wr_id', async ({ client }) => {
    const res = await client.get('/vision/work-requests/wr-does-not-exist-p11')
    res.assertStatus(404)
    res.assertBodyContains({ ok: false })
  })

  test('GET /vision/work-requests?status= filters to that status', async ({ client }) => {
    const res = await client.get('/vision/work-requests').qs({ status: 'validated', limit: 50 })
    res.assertStatus(200)
    res.assert!.properties(res.body(), ['ok', 'work_requests'])
    res.assert!.isArray(res.body().work_requests)
    for (const wr of res.body().work_requests) {
      res.assert!.equal(wr.status, 'validated')
    }
  })
})

test.group('vision receipts (P1-1 depth)', () => {
  test('GET /vision/receipts without planId is rejected 400', async ({ client }) => {
    const res = await client.get('/vision/receipts')
    res.assertStatus(400)
    res.assertBodyContains({ ok: false })
  })

  test('GET /vision/receipts?planId= returns the receipts array (possibly empty)', async ({ client }) => {
    const res = await client.get('/vision/receipts').qs({ planId: 'plan-p11-depth-nonexistent' })
    res.assertStatus(200)
    res.assert!.properties(res.body(), ['ok', 'receipts'])
    res.assert!.isArray(res.body().receipts)
  })
})

test.group('wr drift-scan (P1-1 depth)', () => {
  test('GET /wr/drift-scan returns {scanned, drifted, findings}', async ({ client }) => {
    const res = await client.get('/wr/drift-scan').qs({ limit: 10 })
    res.assertStatus(200)
    res.assert!.properties(res.body(), ['ok', 'scanned', 'drifted', 'findings'])
    res.assert!.isArray(res.body().findings)
  })
})
