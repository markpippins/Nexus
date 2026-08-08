import * as http from 'http';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { startHeartbeat } from 'heartbeat-client';
import { createRestFsService } from './fs-service-impl.js';
import { createRestFsServiceRouter } from '../../tsp-output/server/js/src/generated/http/router.js';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PORT = process.env.FS_SERVER_PORT || 4040;

// ── Process-level safety net ─────────────────────────────────────
process.on('uncaughtException', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`fs-server: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[fs-server] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[fs-server] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

// Allow command-line override for root directory
const cliRootArg = process.argv[2];
const effectiveRoot = cliRootArg || process.env.FS_ROOT_DIR;
const FS_ROOT_DIR = effectiveRoot
  ? path.resolve(effectiveRoot)
  : path.resolve(process.cwd(), 'fs_root');

// Set environment for service implementation
process.env.FS_ROOT_DIR = FS_ROOT_DIR;

// Create the service implementation
const restFsService = createRestFsService();

// Create the router from TypeSpec generated code
const router = createRestFsServiceRouter(restFsService, {
  onRequestNotFound: (ctx) => {
    ctx.response.statusCode = 404;
    ctx.response.setHeader('Content-Type', 'application/json');
    ctx.response.end(JSON.stringify({ detail: 'Not Found' }));
  },
  onInvalidRequest: (ctx, route, error) => {
    ctx.response.statusCode = 400;
    ctx.response.setHeader('Content-Type', 'application/json');
    ctx.response.end(JSON.stringify({ detail: error }));
  },
  onInternalError: (ctx, error) => {
    console.error('Internal server error:', error);
    ctx.response.statusCode = 500;
    ctx.response.setHeader('Content-Type', 'application/json');
    ctx.response.end(JSON.stringify({ detail: error instanceof Error ? error.message : 'Internal Server Error' }));
  },
});

// Add CORS headers and health check
const server = http.createServer((req, res) => {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'UP',
      service: 'file-system-server',
      timestamp: new Date().toISOString(),
      details: {
        fsRootDir: FS_ROOT_DIR,
        port: PORT
      }
    }));
    return;
  }

  // Dispatch to TypeSpec router
  router.dispatch(req, res);
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`File system root is ${FS_ROOT_DIR}`);
  console.log(`TypeSpec routes: /list, /cd, /mkdir, /rmdir, /touch, /rm, /rename, /rename-item, /copy, /move, /move-items, /has-file, /has-folder`);

  startHeartbeat({
    serviceId: 115,
    serviceName: 'file-system-server',
    interval: 30,
    log: (...args: any[]) => console.log(new Date().toISOString(), '[heartbeat file-system-server]', ...args),
  });
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`fs-server: port ${PORT} already in use, exiting (code EADDRINUSE)`);
  } else {
    console.error('fs-server: listen error:', err.message);
  }
  process.exit(1);
});
