import * as fs from 'fs/promises';
import * as path from 'path';
import * as winston from 'winston';
import { HttpContext } from '../../tsp-output/server/js/src/generated/helpers/router.js';
import {
  FsListResponse,
  FsItem,
  FsOperationResponse,
  FsRequest,
  FsItemReference,
} from '../../tsp-output/server/js/src/generated/models/all/rest-fs-service.js';
import { Temporal } from 'temporal-polyfill';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'file-system-server' },
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

const FS_ROOT_DIR = process.env.FS_ROOT_DIR 
  ? path.resolve(process.env.FS_ROOT_DIR)
  : path.resolve(process.cwd(), 'fs_root');

/**
 * Ensures that a resolved path is safely within a specified root directory.
 */
function ensurePath(rootDir: string, parts: string[]): string {
  const resolvedPath = path.resolve(rootDir, ...parts);
  if (!resolvedPath.startsWith(rootDir)) {
    throw new Error('Invalid path traversal attempted');
  }
  return resolvedPath;
}

/**
 * Convert fs.Stats to FsItem
 */
function statToFsItem(name: string, stats: fs.Stats): FsItem {
  return {
    name,
    _type: stats.isDirectory() ? 'directory' : 'file',
    size: BigInt(stats.size),
    lastModified: Temporal.Instant.from(stats.mtime.toISOString()),
    lastModifiedDate: stats.mtime.toISOString(),
  };
}

/**
 * Build user path from alias and request path
 */
function buildUserPath(alias: string | undefined, requestPath: string[] = []): string[] {
  const userPath: string[] = ['users'];
  if (alias) {
    userPath.push(alias);
  }
  if (requestPath && requestPath.length > 0) {
    userPath.push(...requestPath);
  }
  return userPath;
}

export interface RestFsService {
  listFiles(ctx: HttpContext, input: FsRequest): Promise<FsListResponse>;
  changeDirectory(ctx: HttpContext, input: FsRequest): Promise<FsListResponse>;
  createDirectory(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse>;
  removeDirectory(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse>;
  createFile(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse>;
  deleteFile(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse>;
  rename(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse>;
  renameItem(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse>;
  copy(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse>;
  move(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse>;
  moveItems(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse>;
  hasFile(ctx: HttpContext, input: FsRequest): Promise<{ exists: boolean }>;
  hasFolder(ctx: HttpContext, input: FsRequest): Promise<{ exists: boolean }>;
}

export function createRestFsService(): RestFsService {
  // Ensure root directory exists
  fs.mkdir(FS_ROOT_DIR, { recursive: true }).catch((err) => {
    logger.error('Failed to create root directory', { error: err.message, fsRoot: FS_ROOT_DIR });
  });

  return {
    async listFiles(ctx: HttpContext, input: FsRequest): Promise<FsListResponse> {
      const userPath = buildUserPath(input.alias, input.path);
      const targetPath = ensurePath(FS_ROOT_DIR, userPath);
      
      logger.info('Listing directory', { path: targetPath, alias: input.alias });
      
      const stats = await fs.stat(targetPath);
      if (!stats.isDirectory()) {
        throw new Error('Path is not a directory');
      }
      
      const items: FsItem[] = [];
      const entries = await fs.readdir(targetPath);
      
      for (const entry of entries) {
        const entryPath = path.join(targetPath, entry);
        const entryStats = await fs.stat(entryPath);
        items.push(statToFsItem(entry, entryStats));
      }
      
      return {
        path: input.path || [],
        items,
      };
    },

    async changeDirectory(ctx: HttpContext, input: FsRequest): Promise<FsListResponse> {
      const userPath = buildUserPath(input.alias, input.path);
      const targetPath = ensurePath(FS_ROOT_DIR, userPath);
      
      logger.info('Changing directory', { path: targetPath, alias: input.alias });
      
      const stats = await fs.stat(targetPath);
      if (!stats.isDirectory()) {
        throw new Error('Path is not a directory');
      }
      
      return {
        path: input.path || [],
        items: [],
      };
    },

    async createDirectory(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse> {
      const userPath = buildUserPath(input.alias, input.path);
      const targetPath = ensurePath(FS_ROOT_DIR, userPath);
      
      logger.info('Creating directory', { path: targetPath, alias: input.alias });
      
      await fs.mkdir(targetPath, { recursive: true });
      
      return {
        created: targetPath,
      };
    },

    async removeDirectory(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse> {
      const userPath = buildUserPath(input.alias, input.path);
      const targetPath = ensurePath(FS_ROOT_DIR, userPath);
      
      logger.info('Removing directory', { path: targetPath, alias: input.alias });
      
      await fs.rm(targetPath, { recursive: true, force: true });
      
      return {
        deleted: targetPath,
      };
    },

    async createFile(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse> {
      if (!input.filename) {
        throw new Error('Filename is required for createFile operation');
      }
      
      const userPath = buildUserPath(input.alias, input.path);
      const parentDirPath = ensurePath(FS_ROOT_DIR, userPath);
      
      logger.info('Creating file', { filename: input.filename, path: parentDirPath, alias: input.alias });
      
      await fs.mkdir(parentDirPath, { recursive: true });
      const newFilePath = path.join(parentDirPath, input.filename);
      await fs.writeFile(newFilePath, '');
      
      return {
        created_file: newFilePath,
      };
    },

    async deleteFile(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse> {
      if (!input.filename) {
        throw new Error('Filename is required for deleteFile operation');
      }
      
      const userPath = buildUserPath(input.alias, [...(input.path || []), input.filename]);
      const targetPath = ensurePath(FS_ROOT_DIR, userPath);
      
      logger.info('Deleting file', { path: targetPath, alias: input.alias });
      
      await fs.unlink(targetPath);
      
      return {
        deleted_file: targetPath,
      };
    },

    async rename(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse> {
      if (!input.newName) {
        throw new Error('New name is required for rename operation');
      }
      
      const userPath = buildUserPath(input.alias, input.path);
      const sourcePath = ensurePath(FS_ROOT_DIR, userPath);
      const newPath = path.join(path.dirname(sourcePath), input.newName);
      
      logger.info('Renaming', { from: sourcePath, to: newPath, alias: input.alias });
      
      await fs.rename(sourcePath, newPath);
      
      return {
        renamed: sourcePath,
        to: newPath,
      };
    },

    async renameItem(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse> {
      // renameItem is the same as rename
      return this.rename(ctx, input);
    },

    async copy(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse> {
      if (!input.toPath) {
        throw new Error('Destination path is required for copy operation');
      }
      
      const sourceUserPath = buildUserPath(input.alias, input.path);
      const destUserPath = buildUserPath(input.toAlias || input.alias, input.toPath);
      
      const sourcePath = ensurePath(FS_ROOT_DIR, sourceUserPath);
      const destPath = ensurePath(FS_ROOT_DIR, destUserPath);
      
      logger.info('Copying', { from: sourcePath, to: destPath, alias: input.alias });
      
      await fs.cp(sourcePath, destPath, { recursive: true });
      
      return {
        copied: sourcePath,
        to: destPath,
      };
    },

    async move(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse> {
      if (!input.toPath) {
        throw new Error('Destination path is required for move operation');
      }
      
      const sourceUserPath = buildUserPath(input.alias, input.path);
      const destUserPath = buildUserPath(input.toAlias || input.alias, input.toPath);
      
      const sourcePath = ensurePath(FS_ROOT_DIR, sourceUserPath);
      const destPath = ensurePath(FS_ROOT_DIR, destUserPath);
      
      logger.info('Moving', { from: sourcePath, to: destPath, alias: input.alias });
      
      await fs.rename(sourcePath, destPath);
      
      return {
        moved: sourcePath,
        to: destPath,
      };
    },

    async moveItems(ctx: HttpContext, input: FsRequest): Promise<FsOperationResponse> {
      if (!input.toPath || !input.items) {
        throw new Error('Destination path and items are required for moveItems operation');
      }
      
      const sourceUserPath = buildUserPath(input.alias, input.path);
      const destUserPath = buildUserPath(input.alias, input.toPath);
      
      const destPath = ensurePath(FS_ROOT_DIR, destUserPath);
      
      logger.info('Moving items', { 
        count: input.items.length, 
        destination: destPath, 
        alias: input.alias 
      });
      
      for (const item of input.items) {
        const sourcePath = ensurePath(FS_ROOT_DIR, [...sourceUserPath, item.name]);
        const destItemPath = path.join(destPath, item.name);
        await fs.rename(sourcePath, destItemPath);
      }
      
      return {
        moved: input.path?.join('/') || '',
        to: destPath,
      };
    },

    async hasFile(ctx: HttpContext, input: FsRequest): Promise<{ exists: boolean }> {
      if (!input.filename) {
        throw new Error('Filename is required for hasFile operation');
      }
      
      const userPath = buildUserPath(input.alias, [...(input.path || []), input.filename]);
      const targetPath = ensurePath(FS_ROOT_DIR, userPath);
      
      logger.info('Checking file existence', { path: targetPath, alias: input.alias });
      
      try {
        const stats = await fs.stat(targetPath);
        return { exists: stats.isFile() };
      } catch {
        return { exists: false };
      }
    },

    async hasFolder(ctx: HttpContext, input: FsRequest): Promise<{ exists: boolean }> {
      if (!input.filename) {
        throw new Error('Folder name is required for hasFolder operation');
      }
      
      const userPath = buildUserPath(input.alias, [...(input.path || []), input.filename]);
      const targetPath = ensurePath(FS_ROOT_DIR, userPath);
      
      logger.info('Checking folder existence', { path: targetPath, alias: input.alias });
      
      try {
        const stats = await fs.stat(targetPath);
        return { exists: stats.isDirectory() };
      } catch {
        return { exists: false };
      }
    },
  };
}
