import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diffJsonb } from '../src/routes/state.js';

describe('diffJsonb', () => {
  it('returns empty when values are referentially equal', () => {
    assert.deepEqual(diffJsonb(null, null), { added: {}, removed: [], changed: [] });
    assert.deepEqual(diffJsonb(undefined, undefined), { added: {}, removed: [], changed: [] });
  });
  it('treats to=null as full removal (from-side keys go to removed)', () => {
    const r = diffJsonb({ a: 1, b: 2 }, null);
    assert.deepEqual(r.removed, ['a', 'b']);
    assert.equal(Object.keys(r.added).length, 0);
    assert.equal(r.changed.length, 0);
  });
  it('treats from=null as full add (to-side keys go to added)', () => {
    const r = diffJsonb(null, { a: 1, b: 2 });
    assert.deepEqual(r.added, { a: 1, b: 2 });
    assert.deepEqual(r.removed, []);
    assert.deepEqual(r.changed, []);
  });
  it('detects adds on top of an existing baseline', () => {
    const r = diffJsonb({ a: 1 }, { a: 1, b: 2, c: 3 });
    assert.deepEqual(r.added, { b: 2, c: 3 });
    assert.deepEqual(r.removed, []);
    assert.deepEqual(r.changed, []);
  });
  it('detects removals on top of an existing baseline', () => {
    const r = diffJsonb({ a: 1, b: 2, c: 3 }, { a: 1 });
    assert.deepEqual(r.added, {});
    assert.deepEqual(r.removed.sort(), ['b', 'c']);
    assert.deepEqual(r.changed, []);
  });
  it('detects scalar changes within objects', () => {
    const r = diffJsonb({ a: 1, b: 'x' }, { a: 2, b: 'x' });
    assert.deepEqual(r.added, {});
    assert.deepEqual(r.removed, []);
    assert.deepEqual(r.changed, [{ key: 'a', from: 1, to: 2 }]);
  });
  it('detects object-valued changes by deep JSON.stringify', () => {
    const r = diffJsonb({ a: { x: 1 } }, { a: { x: 2 } });
    assert.deepEqual(r.changed, [{ key: 'a', from: { x: 1 }, to: { x: 2 } }]);
  });
  it('treats equal-nested as no-change', () => {
    const r = diffJsonb({ a: { x: 1 } }, { a: { x: 1 } });
    assert.deepEqual(r.changed, []);
  });
  it('handles pure scalars as a single $scalar changed entry', () => {
    const r = diffJsonb(5, 7);
    assert.deepEqual(r.changed, [{ key: '$scalar', from: 5, to: 7 }]);
    // symmetric
    const r2 = diffJsonb('y', 'z');
    assert.deepEqual(r2.changed, [{ key: '$scalar', from: 'y', to: 'z' }]);
  });
  it('handles from-scalar to-object and vice versa without crashing', () => {
    assert.doesNotThrow(() => diffJsonb(5, { a: 1 }));
    const r = diffJsonb(5, { a: 1 });
    // From-scalar: there is no object to diff against; treated as scalar
    // change only because either side is non-object.
    assert.equal(r.changed.length, 1);
    assert.equal(r.changed[0].key, '$scalar');
  });
  it('handles arrays as scalar-shaped (no element-wise diffing)', () => {
    const r = diffJsonb([1, 2, 3], [1, 2, 3, 4]);
    assert.equal(r.changed.length, 1);
    assert.equal(r.changed[0].key, '$scalar');
  });
});
