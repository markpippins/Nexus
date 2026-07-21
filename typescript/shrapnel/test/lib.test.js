import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TYPE_CODES,
  TYPE_NAMES,
  EXTENSION_TABLES,
  assertKnownTypeName,
  inferTypeName,
  coerceForStorage,
  coerceFromStorage,
} from '../src/lib/types.js';
import { normaliseFieldSpec } from '../src/lib/encode.js';

describe('types registry', () => {
  it('has the canonical 7 codes', () => {
    assert.equal(TYPE_CODES.Long, 1);
    assert.equal(TYPE_CODES.String, 2);
    assert.equal(TYPE_CODES.Double, 3);
    assert.equal(TYPE_CODES.Boolean, 4);
    assert.equal(TYPE_CODES.Timestamp, 5);
    assert.equal(TYPE_CODES.JSONB, 6);
    assert.equal(TYPE_CODES.UUID, 7);
  });

  it('has extension tables for every code', () => {
    for (const code of Object.values(TYPE_CODES)) {
      assert.ok(EXTENSION_TABLES[code], `missing extension table for code ${code}`);
    }
  });

  it('rejects unknown type names', () => {
    assert.throws(() => assertKnownTypeName('Nope'), /unknown type 'Nope'/);
  });

  it('maps type names to codes', () => {
    assert.equal(assertKnownTypeName('Long'), 1);
    assert.equal(assertKnownTypeName('JSONB'), 6);
    assert.equal(TYPE_NAMES[6], 'JSONB');
  });
});

describe('inferTypeName', () => {
  it('infers booleans', () => {
    assert.equal(inferTypeName(true), 'Boolean');
    assert.equal(inferTypeName(false), 'Boolean');
  });
  it('infers Long vs Double from JS numbers', () => {
    assert.equal(inferTypeName(42), 'Long');
    assert.equal(inferTypeName(3.14), 'Double');
  });
  it('infers Timestamp from ISO strings', () => {
    assert.equal(inferTypeName('2024-01-01T00:00:00Z'), 'Timestamp');
  });
  it('infers UUID from canonical UUID strings', () => {
    assert.equal(inferTypeName('f47ac10b-58cc-4372-a567-0e02b2c3d479'), 'UUID');
  });
  it('infers String otherwise', () => {
    assert.equal(inferTypeName('hello'), 'String');
  });
  it('infers JSONB for objects', () => {
    assert.equal(inferTypeName({ a: 1 }), 'JSONB');
    assert.equal(inferTypeName([1, 2, 3]), 'JSONB');
  });
  it('refuses null', () => {
    assert.throws(() => inferTypeName(null), /null/);
  });
});

describe('coerceForStorage', () => {
  it('passes Long through', () => {
    assert.equal(coerceForStorage(7, TYPE_CODES.Long), 7);
  });
  it('casts a numeric string to Long', () => {
    assert.equal(coerceForStorage('7', TYPE_CODES.Long), 7);
  });
  it('passes JSONB objects through', () => {
    const o = { a: 1 };
    assert.equal(coerceForStorage(o, TYPE_CODES.JSONB), o);
  });
  it('ISO-stringifies dates for timestamptz', () => {
    const d = new Date('2024-01-01T00:00:00Z');
    assert.equal(coerceForStorage(d, TYPE_CODES.Timestamp), '2024-01-01T00:00:00.000Z');
  });
});

describe('coerceFromStorage', () => {
  it('parses Long', () => {
    assert.equal(coerceFromStorage('30', TYPE_CODES.Long), 30);
  });
  it('parses Double', () => {
    assert.equal(coerceFromStorage('3.14', TYPE_CODES.Double), 3.14);
  });
  it('parses Boolean strings', () => {
    assert.equal(coerceFromStorage('true', TYPE_CODES.Boolean), true);
    assert.equal(coerceFromStorage('false', TYPE_CODES.Boolean), false);
  });
  it('parses JSONB strings', () => {
    assert.deepEqual(coerceFromStorage('{"a":1}', TYPE_CODES.JSONB), { a: 1 });
  });
  it('passes String/UUID through', () => {
    assert.equal(coerceFromStorage('hello', TYPE_CODES.String), 'hello');
    assert.equal(coerceFromStorage('f47ac10b-58cc-4372-a567-0e02b2c3d479', TYPE_CODES.UUID), 'f47ac10b-58cc-4372-a567-0e02b2c3d479');
  });
});

describe('normaliseFieldSpec', () => {
  it('accepts {type: "Long"}', () => {
    const spec = normaliseFieldSpec({ property_name: 'age', type: 'Long', label: 'Age' });
    assert.equal(spec.property_name, 'age');
    assert.equal(spec.field_type_code, 1);
    assert.equal(spec.label, 'Age');
    assert.equal(spec.name, 'age');
    assert.equal(spec.is_calculated, false);
    assert.equal(spec.field_index, 0);
  });
  it('accepts {field_type_code: 2}', () => {
    const spec = normaliseFieldSpec({ property_name: 'name', field_type_code: 2 });
    assert.equal(spec.field_type_code, 2);
  });
  it('defaults name to property_name', () => {
    const spec = normaliseFieldSpec({ property_name: 'name', type: 'String' });
    assert.equal(spec.name, 'name');
  });
  it('rejects missing property_name', () => {
    assert.throws(() => normaliseFieldSpec({ type: 'Long' }), /property_name/);
  });
  it('rejects missing type info', () => {
    assert.throws(() => normaliseFieldSpec({ property_name: 'x' }), /missing type/);
  });
  it('rejects unknown type name', () => {
    assert.throws(() => normaliseFieldSpec({ property_name: 'x', type: 'Nope' }), /unknown type/);
  });
  it('rejects unknown field_type_code', () => {
    assert.throws(() => normaliseFieldSpec({ property_name: 'x', field_type_code: 99 }), /unknown field_type_code/);
  });
});
