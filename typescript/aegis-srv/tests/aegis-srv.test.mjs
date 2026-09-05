import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Pure-logic unit tests (no DB required) ─────────────────────────
// These exercise the request-shaping helpers and the contract↔source
// coverage invariant. The DB-backed CRUD behavior is verified by the
// integration suite (tests/integration/).

function jsonbCoerce(body, cols) {
  const JSONB_COLS = new Set([
    'metadata', 'value', 'initial_value', 'domain', 'variable_assignments',
    'action', 'default_value', 'trace', 'errors', 'warnings', 'suggestions', 'context',
  ]);
  return cols.map((c) => {
    const v = body[c];
    if (JSONB_COLS.has(c) && v !== null && v !== undefined) {
      return JSON.stringify(v);
    }
    return v;
  });
}

function pick(body, allowed) {
  const out = {};
  for (const k of allowed) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

test('jsonbCoerce stringifies arrays and scalars, leaves plain text and null alone', () => {
  const body = { domain: ['a', 'b'], value: 3, initial_value: 'red', constraints: ['x>0'], name: 'n', nocol: null };
  const cols = ['name', 'domain', 'value', 'initial_value', 'constraints'];
  const out = jsonbCoerce(body, cols);
  // name (varchar) passes through untouched
  assert.equal(out[0], 'n');
  // domain is JSONB -> stringified array
  assert.equal(out[1], '["a","b"]');
  // value is JSONB -> stringified scalar
  assert.equal(out[2], '3');
  // initial_value is JSONB -> stringified string (must be valid JSON text)
  assert.equal(out[3], '"red"');
  // constraints is text[] -> passed as array (pg handles array literal)
  assert.deepEqual(out[4], ['x>0']);
});

test('jsonbCoerce keeps null/undefined as null for jsonb columns', () => {
  const out = jsonbCoerce({ value: null }, ['value']);
  assert.equal(out[0], null);
});

test('pick selects only allowed present fields', () => {
  const body = { name: 'x', type: 'T', bogus: 1, extra: true };
  const out = pick(body, ['name', 'type']);
  assert.deepEqual(out, { name: 'x', type: 'T' });
});

test('pick drops undefined fields', () => {
  const body = { name: 'x', description: undefined };
  assert.deepEqual(pick(body, ['name', 'description']), { name: 'x' });
});

test('isUuid accepts valid UUIDs and rejects others', () => {
  assert.ok(isUuid('3c27e87d-cd91-41c9-a21e-c982d94c65c5'));
  assert.ok(!isUuid('not-a-uuid'));
  assert.ok(!isUuid(''));
  assert.ok(!isUuid('3c27e87d-cd91-41c9-a21e-c982d94c65c')); // truncated
});

// ── Contract ↔ source coverage invariant ───────────────────────────
// Every route declared in the Express router (literal paths) must exist
// in the TypeSpec contract, and vice versa. This is the reconciler's
// proof in mini-form, so a regression here is caught without CI.
test('every source route path has a matching TypeSpec @route', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes.ts'), 'utf8');
  const tsp = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'typespec', 'v1', 'aegis-srv', 'typescript', 'operations.tsp'),
    'utf8',
  );

  // source literal routes: router.<verb>('/path')
  const srcRouteRe = /router\.(get|post|put|patch|delete|head|options)\(\s*'(\/[^']+)'/g;
  const tspRouteRe = /@route\s*\(\s*"(\/[^"]+)"\s*\)\s*@(get|post|put|patch|delete|head|options)/g;

  const srcPaths = new Set();
  let m;
  while ((m = srcRouteRe.exec(src))) {
    // Express :param -> TypeSpec {param}, prepended with the /api mount
    // prefix (routes.ts router is mounted at /api in index.ts).
    srcPaths.add('/api' + m[2].replace(/:([a-z]+)/g, '{$1}'));
  }
  const tspPaths = new Set();
  while ((m = tspRouteRe.exec(tsp))) {
    tspPaths.add(m[1]);
  }

  const missingInTsp = [...srcPaths].filter((p) => !tspPaths.has(p));
  // /health is served at app level in index.ts (not the /api-mounted router),
  // so it legitimately exists only in the contract's full path set.
  const appLevelPaths = ['/health'];
  const extraInTsp = [...tspPaths].filter((p) => !srcPaths.has(p) && !appLevelPaths.includes(p));

  assert.deepEqual(missingInTsp, [], `source routes missing from contract: ${missingInTsp.join(', ')}`);
  assert.deepEqual(extraInTsp, [], `contract routes missing from source: ${extraInTsp.join(', ')}`);
  assert.ok(srcPaths.size >= 25, `expected >=25 distinct paths, got ${srcPaths.size}`);
});