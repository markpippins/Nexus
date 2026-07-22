import { AppError } from './errors.js';

export function errorHandler(err, _req, res, _next) {
  if (res.headersSent) {
    return;
  }

  console.error('[error]', err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
}
