import { ApiError } from './errors.js';

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { message: err.message, details: err.details },
    });
  }
  // PG unique violation / FK violation -> 409
  if (err && err.code === '23505') {
    return res.status(409).json({
      error: { message: 'duplicate', details: err.detail || err.message },
    });
  }
  if (err && err.code === '23503') {
    return res.status(409).json({
      error: { message: 'foreign_key_violation', details: err.detail || err.message },
    });
  }
  console.error('[shrapnel] unhandled error', err);
  return res.status(500).json({ error: { message: 'internal_error' } });
}

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: { message: 'not_found' } });
}
