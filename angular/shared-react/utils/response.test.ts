import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {unwrapErrorMessage, unwrapList} from './response.ts';

describe('unwrapList', () => {
  it('passes a bare array through unchanged', () => {
    const list = [{id: 1}];
    assert.equal(unwrapList(list), list);
  });

  it('extracts the array from a wrapped { count, key: [...] } response', () => {
    const wrapped = {count: 2, sessions: [{id: 'a'}, {id: 'b'}]};
    const out = unwrapList(wrapped, 'sessions');
    assert.deepEqual(out, wrapped.sessions);
  });

  it('returns [] when the wrapped key is absent', () => {
    assert.deepEqual(unwrapList({count: 0}, 'sessions'), []);
  });

  it('returns [] when the wrapped key holds a non-array', () => {
    assert.deepEqual(unwrapList({sessions: 'oops'}, 'sessions'), []);
  });

  it('returns [] for null/undefined/non-object data', () => {
    assert.deepEqual(unwrapList(null), []);
    assert.deepEqual(unwrapList(undefined), []);
    assert.deepEqual(unwrapList(42), []);
    assert.deepEqual(unwrapList('nope'), []);
  });

  it('does not extract when no key is provided and data is an object', () => {
    assert.deepEqual(unwrapList({sessions: [{id: 1}]}), []);
  });
});

describe('unwrapErrorMessage', () => {
  it('extracts from { error: "msg" }', () => {
    assert.equal(unwrapErrorMessage({error: 'boom'}), 'boom');
  });

  it('extracts from nested { error: { code, message } }', () => {
    assert.equal(
      unwrapErrorMessage({error: {code: 'NOT_FOUND', message: 'Identity not found'}}),
      'Identity not found'
    );
  });

  it('extracts the code when the nested error has no message', () => {
    assert.equal(unwrapErrorMessage({error: {code: 'BAD_GATEWAY'}}), 'BAD_GATEWAY');
  });

  it('extracts from { message }', () => {
    assert.equal(unwrapErrorMessage({message: 'oops'}), 'oops');
  });

  it('extracts from { detail }', () => {
    assert.equal(unwrapErrorMessage({detail: 'backend unreachable'}), 'backend unreachable');
  });

  it('accepts a plain string body', () => {
    assert.equal(unwrapErrorMessage('plain text error'), 'plain text error');
  });

  it('prefers error over message when both are present', () => {
    assert.equal(unwrapErrorMessage({error: 'err', message: 'msg'}), 'err');
  });

  it('falls back for null / undefined / non-object bodies', () => {
    assert.equal(unwrapErrorMessage(null), 'Request failed');
    assert.equal(unwrapErrorMessage(undefined), 'Request failed');
    assert.equal(unwrapErrorMessage(42), 'Request failed');
    assert.equal(unwrapErrorMessage([1, 2]), 'Request failed');
  });

  it('falls back for empty-string fields', () => {
    assert.equal(unwrapErrorMessage({error: ''}), 'Request failed');
    assert.equal(unwrapErrorMessage({message: '   '}), 'Request failed');
  });

  it('uses the caller-provided fallback', () => {
    assert.equal(unwrapErrorMessage(null, 'HTTP 500'), 'HTTP 500');
  });
});
