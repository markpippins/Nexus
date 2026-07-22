import { describe, it, expect, vi } from 'vitest';
import { errorHandler } from './error-handler.js';

describe('errorHandler', () => {
  it('returns generic Internal server error for unknown errors', () => {
    const err = new Error('DB connection failed: secret details');
    const req = {};
    const res = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('secret') }));
  });

  it('does not send a response if headers have already been sent', () => {
    const err = new Error('late error');
    const req = {};
    const res = {
      headersSent: true,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
