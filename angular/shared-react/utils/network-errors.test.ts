import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  NETWORK_FAILURE_MESSAGES,
  friendlyFetchError,
  friendlyFetchMessage,
  isNetworkFailure,
} from './network-errors.ts';

const FRIENDLY = 'Network error - backend unreachable';
// The three known browser/Node fetch network-failure messages.
const NETWORK_FAILURES = [
  'Failed to fetch', // Chrome/Chromium
  'NetworkError when attempting to fetch resource.', // Firefox
  'fetch failed', // Node (undici)
];

describe('NETWORK_FAILURE_MESSAGES', () => {
  it('contains exactly the three known failure messages', () => {
    assert.deepEqual(NETWORK_FAILURE_MESSAGES, NETWORK_FAILURES);
  });
});

describe('isNetworkFailure', () => {
  it('returns true for an Error carrying any known network-failure message', () => {
    for (const msg of NETWORK_FAILURES) {
      assert.equal(isNetworkFailure(new Error(msg)), true, `msg: ${msg}`);
    }
  });

  it('returns false for a generic Error', () => {
    assert.equal(isNetworkFailure(new Error('boom')), false);
  });

  it('returns false for a network-failure string not wrapped in an Error', () => {
    assert.equal(isNetworkFailure('Failed to fetch'), false);
  });

  it('returns false for non-Error values', () => {
    assert.equal(isNetworkFailure(undefined), false);
    assert.equal(isNetworkFailure(null), false);
    assert.equal(isNetworkFailure(42), false);
    // A plain object that merely looks like an Error must not match.
    assert.equal(isNetworkFailure({message: 'Failed to fetch'}), false);
  });
});

describe('friendlyFetchError', () => {
  it('returns a friendly Error for each known network-failure message', () => {
    for (const msg of NETWORK_FAILURES) {
      const err = friendlyFetchError(new Error(msg));
      assert.ok(err instanceof Error, `msg: ${msg}`);
      assert.equal(err.message, FRIENDLY, `msg: ${msg}`);
    }
  });

  it('passes non-network Errors through unchanged (same instance)', () => {
    const original = new Error('boom');
    assert.equal(friendlyFetchError(original), original);
  });

  it('returns a NEW Error (not the input instance) for network failures', () => {
    for (const msg of NETWORK_FAILURES) {
      const original = new Error(msg);
      assert.notEqual(friendlyFetchError(original), original, `msg: ${msg}`);
    }
  });

  it('wraps non-Error values in an Error with String(e)', () => {
    const cases: Array<[unknown, string]> = [
      ['oops', 'oops'],
      [42, '42'],
      [null, 'null'],
      [undefined, 'undefined'],
      [{a: 1}, '[object Object]'],
    ];
    for (const [value, expected] of cases) {
      const err = friendlyFetchError(value);
      assert.ok(err instanceof Error, `value: ${String(value)}`);
      assert.equal(err.message, expected, `value: ${String(value)}`);
    }
  });
});

describe('friendlyFetchMessage', () => {
  it('returns the friendly string for each known network-failure message', () => {
    for (const msg of NETWORK_FAILURES) {
      assert.equal(friendlyFetchMessage(new Error(msg)), FRIENDLY, `msg: ${msg}`);
    }
  });

  it('returns the original message for non-network Errors', () => {
    assert.equal(friendlyFetchMessage(new Error('boom')), 'boom');
  });

  it('falls back to String(e) when the Error has an empty message', () => {
    // String(new Error('')) is 'Error' (Error.prototype.toString).
    assert.equal(friendlyFetchMessage(new Error('')), 'Error');
  });

  it('returns String(e) for non-Error values', () => {
    assert.equal(friendlyFetchMessage('oops'), 'oops');
    assert.equal(friendlyFetchMessage(42), '42');
    assert.equal(friendlyFetchMessage(null), 'null');
    assert.equal(friendlyFetchMessage(undefined), 'undefined');
  });
});
