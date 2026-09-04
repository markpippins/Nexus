// This is a Node.js server file. The triple-slash directive below ensures that Node.js type definitions are available to the TypeScript compiler.

import { fileURLToPath } from 'url';
import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as winston from 'winston';
import { startHeartbeat } from 'heartbeat-client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'secure-file-system-server' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          (info) => `${info.timestamp} ${info.level} [${info.service}] ${info.message}`
        )
      ),
    }),
  ],
});

// Load environment variables from .env.local in the project directory
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const PORT = process.env.FS_SERVER_PORT || 4040;

// ── Process-level safety net ─────────────────────────────────────
process.on('uncaughtException', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`secure-fs-server: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[secure-fs-server] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[secure-fs-server] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

// --- NEW: Allow command-line override for root directory ---
// Usage: node server.js [rootDir]
const cliRootArg = process.argv[2];
const effectiveRoot = cliRootArg || process.env.FS_ROOT_DIR;

// Ensure FS_ROOT_DIR is an absolute path for security.
const FS_ROOT_DIR = effectiveRoot
    ? path.resolve(effectiveRoot)
    : path.resolve(process.cwd(), 'fs_root');

interface RequestModel {
    alias: string;
    path: string[];
    operation: string;
    newName?: string;
    filename?: string;
    sourcePath?: string[];
    toAlias?: string;
    toPath?: string[];
    destPath?: string[];
    items?: { name: string; type: 'file' | 'folder' }[];
}

/**
 * Ensures that a resolved path is safely within a specified root directory.
 * @param rootDir The absolute path to the root directory.
 * @param parts An array of path segments to join.
 * @returns The resolved, validated absolute path.
 * @throws An error if the path is outside the root directory.
 */
function ensurePathExists(rootDir: string, parts: string[]): string {
    const resolvedPath = path.resolve(rootDir, ...parts);
    if (!resolvedPath.startsWith(rootDir)) {
        // Security check to prevent path traversal attacks.
        throw new Error('Invalid path traversal attempted');
    }
    return resolvedPath;
}

const server = http.createServer(async (req, res) => {
    // Log incoming requests
    logger.info(`Incoming request`, {
        method: req.method,
        url: req.url,
        headers: req.headers
    });

    // Handle CORS pre-flight requests and set CORS headers for all responses.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        logger.debug('Handling CORS preflight request');
        res.writeHead(204);
        res.end();
        return;
    }

    // Handle health check endpoint
    if (req.url === '/health' && req.method === 'GET') {
        logger.info('Health check endpoint called');
        try {
            // Check if the file system root directory is accessible
            await fs.access(FS_ROOT_DIR);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'UP',
                service: 'secure-file-system-server',
                timestamp: new Date().toISOString(),
                details: {
                    fsRootDir: FS_ROOT_DIR,
                    port: PORT
                }
            }));
            logger.info('Health check successful');
        } catch (error) {
            logger.error('Health check failed', { error: (error as Error).message });
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'DOWN',
                service: 'secure-file-system-server',
                timestamp: new Date().toISOString(),
                error: 'File system root directory not accessible'
            }));
        }
        return;
    }

    if (req.url === '/fs' && req.method === 'POST') {
        logger.info('File system operation request received');
        let requestData: RequestModel | undefined = undefined;
        try {
            let body = '';
            for await (const chunk of req) {
                body += chunk;
            }
            logger.debug('Request body received', { bodySize: body.length });
            requestData = JSON.parse(body);
            if (!requestData?.operation) {
                throw new SyntaxError('Invalid request body: missing operation');
            }
            logger.info(`Processing ${requestData.operation} operation`, {
                operation: requestData.operation,
                path: requestData.path,
                alias: requestData.alias
            });

            const userRoot = FS_ROOT_DIR;
            await fs.mkdir(userRoot, { recursive: true });

            let responseData: object;

            switch (requestData.operation) {
                case 'ls': {
                    logger.info('Listing directory contents', { path: requestData.path });
                    const targetPath = ensurePathExists(userRoot, requestData.path);
                    const stats = await fs.stat(targetPath);
                    if (!stats.isDirectory()) {
                        logger.warn('Attempt to list non-directory path', { path: targetPath });
                        throw new Error('Path is not a directory');
                    }
                    const items = [];
                    for (const itemName of await fs.readdir(targetPath)) {
                        const itemPath = path.join(targetPath, itemName);
                        try {
                            // lstat (not stat) so dangling symlinks don't throw ENOENT.
                            const itemStats = await fs.lstat(itemPath);
                            let type: 'directory' | 'file' | 'symlink' = 'file';
                            if (itemStats.isSymbolicLink()) type = 'symlink';
                            else if (itemStats.isDirectory()) type = 'directory';
                            items.push({
                                name: itemName,
                                type,
                                size: itemStats.size,
                                last_modified: itemStats.mtimeMs,
                            });
                        } catch (e) {
                            logger.warn('Skipping inaccessible entry', { path: targetPath, entry: itemName });
                        }
                    }
                    responseData = { path: requestData.path, items };
                    logger.info('Directory listing completed', { itemCount: items.length, path: requestData.path });
                    break;
                }
                case 'cd': {
                    logger.info('Changing directory', { path: requestData.path });
                    const targetPath = ensurePathExists(userRoot, requestData.path);
                    const stats = await fs.stat(targetPath);
                    if (!stats.isDirectory()) {
                        logger.warn('Attempt to change to non-directory path', { path: targetPath });
                        throw new Error('Path is not a directory');
                    }
                    responseData = { path: requestData.path };
                    logger.info('Directory change completed', { path: requestData.path });
                    break;
                }
                case 'mkdir': {
                    logger.info('Creating directory', { path: requestData.path });
                    const targetPath = ensurePathExists(userRoot, requestData.path);
                    await fs.mkdir(targetPath, { recursive: true });
                    responseData = { created: targetPath };
                    logger.info('Directory created', { path: targetPath });
                    break;
                }
                case 'rmdir': {
                    logger.info('Removing directory', { path: requestData.path });
                    const targetPath = ensurePathExists(userRoot, requestData.path);
                    await fs.rm(targetPath, { recursive: true, force: true });
                    responseData = { deleted: targetPath };
                    logger.info('Directory removed', { path: targetPath });
                    break;
                }
                case 'newfile': {
                    if (!requestData.filename) {
                        logger.warn('New file operation missing filename');
                        throw new Error('Filename is required for newfile operation');
                    }
                    logger.info('Creating new file', { filename: requestData.filename, path: requestData.path });
                    const parentDirPath = ensurePathExists(userRoot, requestData.path);
                    await fs.mkdir(parentDirPath, { recursive: true });
                    const newFilePath = path.join(parentDirPath, requestData.filename);
                    await fs.writeFile(newFilePath, '');
                    responseData = { created_file: newFilePath };
                    logger.info('New file created', { path: newFilePath });
                    break;
                }
                case 'deletefile': {
                    if (!requestData.filename) {
                        logger.warn('Delete file operation missing filename');
                        throw new Error('Filename is required for deletefile operation');
                    }
                    logger.info('Deleting file', { filename: requestData.filename, path: requestData.path });
                    const targetPath = ensurePathExists(userRoot, [...requestData.path, requestData.filename]);
                    await fs.unlink(targetPath);
                    responseData = { deleted_file: targetPath };
                    logger.info('File deleted', { path: targetPath });
                    break;
                }
                case 'rename': {
                    if (!requestData.newName) {
                        logger.warn('Rename operation missing new name');
                        throw new Error('New name is required for rename operation');
                    }
                    logger.info('Renaming file/directory', {
                        oldPath: requestData.path,
                        newName: requestData.newName
                    });
                    const sourcePath = ensurePathExists(userRoot, requestData.path);
                    const newPath = path.join(path.dirname(sourcePath), requestData.newName);
                    await fs.rename(sourcePath, newPath);
                    responseData = { renamed: sourcePath, to: newPath };
                    logger.info('Rename completed', { from: sourcePath, to: newPath });
                    break;
                }
                case 'copy': {
                    if (!requestData.toPath) {
                        throw new Error('Destination path is required for copy operation');
                    }
                    logger.info('Copying file/directory', {
                        source: requestData.path,
                        destination: requestData.toPath
                    });
                    const sourcePath = ensurePathExists(userRoot, requestData.path);
                    const destPath = ensurePathExists(userRoot, requestData.toPath);
                    await fs.mkdir(path.dirname(destPath), { recursive: true });
                    await fs.cp(sourcePath, destPath, { recursive: true });
                    responseData = { copied: sourcePath, to: destPath };
                    logger.info('Copy completed', { from: sourcePath, to: destPath });
                    break;
                }
                case 'move': {
                    if (!requestData.toPath) {
                        throw new Error('Destination path is required for move operation');
                    }
                    logger.info('Moving file/directory', {
                        source: requestData.path,
                        destination: requestData.toPath
                    });
                    const sourcePath = ensurePathExists(userRoot, requestData.path);
                    const destPath = ensurePathExists(userRoot, requestData.toPath);
                    await fs.mkdir(path.dirname(destPath), { recursive: true });
                    try {
                        await fs.rename(sourcePath, destPath);
                    } catch (err: any) {
                        if (err.code === 'EXDEV') {
                            await fs.cp(sourcePath, destPath, { recursive: true });
                            await fs.rm(sourcePath, { recursive: true, force: true });
                        } else {
                            throw err;
                        }
                    }
                    responseData = { moved: sourcePath, to: destPath };
                    logger.info('Move completed', { from: sourcePath, to: destPath });
                    break;
                }
                case 'hasfile': {
                    if (!requestData.filename) {
                        logger.warn('HasFile operation missing filename');
                        throw new Error('Filename is required for hasfile operation');
                    }
                    logger.info('Checking if file exists', {
                        filename: requestData.filename,
                        path: [...requestData.path, requestData.filename]
                    });
                    const targetPath = ensurePathExists(userRoot, [...requestData.path, requestData.filename]);
                    try {
                        await fs.access(targetPath, fs.constants.F_OK);
                        // If access doesn't throw an error, the file exists
                        responseData = { exists: true, path: targetPath, type: 'file' };
                        logger.info('File exists', { path: targetPath });
                    } catch {
                        // If access throws an error, the file doesn't exist
                        responseData = { exists: false, path: targetPath, type: 'file' };
                        logger.info('File does not exist', { path: targetPath });
                    }
                    break;
                }
                case 'hasfolder': {
                    if (!requestData.filename) {
                        logger.warn('HasFolder operation missing folder name');
                        throw new Error('Folder name is required for hasfolder operation');
                    }
                    logger.info('Checking if folder exists', {
                        folderName: requestData.filename,
                        path: [...requestData.path, requestData.filename]
                    });
                    const targetPath = ensurePathExists(userRoot, [...requestData.path, requestData.filename]);
                    try {
                        const stats = await fs.stat(targetPath);
                        if (stats.isDirectory()) {
                            responseData = { exists: true, path: targetPath, type: 'directory' };
                            logger.info('Folder exists', { path: targetPath });
                        } else {
                            responseData = { exists: false, path: targetPath, type: 'directory' };
                            logger.info('Path exists but is not a directory', { path: targetPath });
                        }
                    } catch {
                        responseData = { exists: false, path: targetPath, type: 'directory' };
                        logger.info('Folder does not exist', { path: targetPath });
                    }
                    break;
                }
                default:
                    logger.warn('Unknown operation requested', { operation: requestData.operation });
                    throw new Error(`Unknown operation: ${requestData.operation}`);
            }
            logger.info('Request completed successfully', {
                operation: requestData.operation,
                responseSize: JSON.stringify(responseData).length
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(responseData));
        } catch (error: any) {
            logger.error('Request processing failed', {
                operation: requestData?.operation,
                error: error.message,
                stack: error.stack
            });

            let statusCode = 500;
            let message = error.message || 'Internal Server Error';

            // If JSON parsing failed, it's a bad request
            if (error instanceof SyntaxError) {
                statusCode = 400;
                message = 'Invalid JSON in request body';
            } else if (error.code === 'ENOENT' || error.message.includes('not a directory')) {
                statusCode = 404;
                message = 'Not Found';
            } else if (error.message.includes('required for')) {
                statusCode = 400;
            }

            logger.warn('Sending error response', { statusCode, message });
            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ detail: message }));
        }
    } else {
        logger.warn('Route not found', { method: req.method, url: req.url });
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detail: 'Not Found' }));
    }
});

server.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`, { port: PORT });
    logger.info(`File system root is ${FS_ROOT_DIR}`, { fsRootDir: FS_ROOT_DIR });

    // 30s heartbeats to service-registry (registry.services id 53).
    // Mirrors src/server.ts; the deployed entrypoint runs fs-serv.ts via `bun run`.
    startHeartbeat({
      serviceId: 53,
      serviceName: 'secure-file-system-server',
      interval: 30,
      log: (...args: any[]) => console.log(new Date().toISOString(), '[heartbeat secure-file-system-server]', ...args),
    });
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`secure-fs-server: port ${PORT} already in use, exiting (code EADDRINUSE)`);
  } else {
    logger.error('secure-fs-server: listen error:', err.message);
  }
  process.exit(1);
});
