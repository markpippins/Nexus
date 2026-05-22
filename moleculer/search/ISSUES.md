# ISSUES.md — Moleculer Search Service

> Generated: 2026-05-21

## Test Results

**24 failed, 8 passed, 32 total** across 3 test suites. All suites fail.

---

### 1. `test/registry-client.service.test.ts` — 7/7 failures

**Root cause:** `ServiceNotFoundError: Service 'registry-client.register' is not found`

The tests create a `ServiceBroker` but never register the `RegistryClientService` into it. `broker.call("registry-client.register")` fails because the service was never loaded.

**Affected tests:**
- `register action › should send correct registration payload`
- `register action › should include metadata in registration payload`
- `register action › should not throw on registration failure`
- `register action › should log success message on successful registration`
- `heartbeat action › should send heartbeat to correct endpoint`
- `heartbeat action › should not throw on heartbeat failure`
- `registration with custom environment › should use custom registry URL from environment`

**Fix:** Each test's `beforeEach` must call `broker.createService(RegistryClientService)` (or load it via `broker.loadService()`) after broker construction and before `broker.start()`.

---

### 2. `test/google-search.service.test.ts` — 9/9 failures

**Root cause:** `ServiceNotFoundError: Service 'google-search.simpleSearch' is not found`

Same pattern — the `GoogleSearchService` is never registered with the test broker.

**Affected tests:**
- `simpleSearch action - parameter validation › should accept query as string`
- `simpleSearch action - parameter validation › should accept optional token parameter`
- `simpleSearch action - Google API call › should call Google API with correct parameters`
- `simpleSearch action - Google API call › should handle empty results`
- `simpleSearch action - Google API call › should handle missing items in response`
- `simpleSearch action - error handling › should handle API errors gracefully`
- `simpleSearch action - error handling › should handle 403 errors from Google API`
- `health action › should return correct health response`

**Fix:** Register `GoogleSearchService` with the broker in `beforeEach` via `broker.createService(GoogleSearchService)`.

---

### 3. `test/api.service.test.ts` — 8/16 failures (8 passed)

**Root cause:** `beforeEach` hook exceeds 5000ms timeout. `broker.start()` hangs.

The `ApiService` uses the `ApiGateway` mixin which attempts to bind to an HTTP port. In the test environment this likely conflicts with port availability, transporter discovery, or NATS connectivity, causing the broker startup to never resolve.

**Affected tests (all timeout in beforeEach):**
- `service configuration › should have the correct service name`
- `service configuration › should be initialized with ApiGateway mixin`
- `settings › should have routes configured`
- `settings › should have /api path configured`
- `settings › should have correct whitelist entries`
- `settings › should have search and health aliases configured`
- `settings › should have CORS configured with wildcard origin`
- `health action › should return correct response structure`
- `health action › should return a valid ISO timestamp`

**Fix:**
- Use a `Transporter` config that doesn't require external NATS (e.g., `Fake` transporter or `null` for local testing).
- Set `transporter: null` in the test broker config if not needed.
- Increase the `beforeEach` timeout or mock the API gateway's server binding.
- Ensure the test broker config includes `nodeID`, `logger`, and `transporter` appropriate for isolated unit tests.

---

### Common Pattern

All three test files share the same structural issue: they instantiate `ServiceBroker` with a `testBrokerConfig` but don't actually load the service under test into the broker before calling `broker.start()`. The pattern should be:

```ts
beforeEach(async () => {
  broker = new ServiceBroker({
    nodeID: "test",
    logger: false,
    transporter: null,  // or Fake transporter
  });
  broker.createService(ServiceUnderTest);
  await broker.start();
});
```
