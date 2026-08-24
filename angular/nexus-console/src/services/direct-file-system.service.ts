import { FileSystemProvider, ItemReference } from './file-system-provider.js';
import { FileSystemNode } from '../models/file-system.model.js';

/**
 * Direct file-system provider backed by the file-system-server on port 4042.
 *
 * This is the **browser-based filesystem surrogate** — it talks directly to
 * the local file-system-server REST API (`/api/fs`, `/api/fs/content`, `/fs`)
 * without going through a gateway broker.  It is the same backend that
 * monaco-judge's `fileSystem.ts` service connects to.
 *
 * Contrast with `SecureFileSystemService`, which routes through a gateway
 * broker's file-service for sandboxed remote access.
 */
const FS_API_BASE = 'http://localhost:4042';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && typeof body.detail === 'string') detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`file-system-server ${detail}`);
  }
  return (await res.json()) as T;
}

function encodePath(parts: string[]): string {
  return encodeURIComponent(parts.join('/'));
}

function toFsPath(path: string[]): string {
  return path.join('/');
}

export class DirectFileSystemService implements FileSystemProvider {
  /** Root display name shown in the tree. */
  readonly displayName = 'Files';

  constructor(private baseUrl: string = FS_API_BASE) {}

  // ── Listing ───────────────────────────────────────────────────

  async getContents(path: string[]): Promise<FileSystemNode[]> {
    const fsPath = toFsPath(path);
    const q = fsPath ? `?path=${encodePath(path)}` : '';
    const data = await request<{ entries: Array<{ name: string; path: string; type: string; size?: number }> }>(
      `${this.baseUrl}/api/fs${q}`,
    );

    const entries = data.entries ?? [];

    return entries.map((e) => {
      const isDir = e.type === 'directory';
      const isSymlink = e.type === 'symlink';
      return {
        name: e.name,
        type: isSymlink ? 'symlink' as const : isDir ? 'folder' as const : 'file' as const,
        modified: undefined,
        content: undefined,
      } satisfies FileSystemNode;
    });
  }

  async getFolderTree(): Promise<FileSystemNode> {
    const children = await this.getContents([]);
    return {
      name: this.displayName,
      type: 'folder',
      children: children.map((c) => ({
        ...c,
        children: c.type === 'folder' ? [] : undefined,
        childrenLoaded: c.type !== 'folder',
      })),
      childrenLoaded: true,
    };
  }

  // ── File content ──────────────────────────────────────────────

  async getFileContent(path: string[], name: string): Promise<string> {
    const fullPath = [...path, name];
    const data = await request<{ content: string }>(
      `${this.baseUrl}/api/fs/content?path=${encodePath(fullPath)}`,
    );
    return data.content ?? '';
  }

  async saveFileContent(path: string[], name: string, content: string): Promise<void> {
    const fullPath = [...path, name];
    await request(
      `${this.baseUrl}/api/fs/content?path=${encodePath(fullPath)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      },
    );
  }

  // ── CRUD ──────────────────────────────────────────────────────

  async createDirectory(path: string[], name: string): Promise<void> {
    const fullPath = [...path, name];
    await request(`${this.baseUrl}/fs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'mkdir', path: fullPath }),
    });
  }

  async removeDirectory(path: string[], name: string): Promise<void> {
    const fullPath = [...path, name];
    await request(`${this.baseUrl}/fs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'rmdir', path: fullPath }),
    });
  }

  async createFile(path: string[], name: string): Promise<void> {
    await request(`${this.baseUrl}/fs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'newfile', path, filename: name }),
    });
  }

  async deleteFile(path: string[], name: string): Promise<void> {
    await request(`${this.baseUrl}/fs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'deletefile', path, filename: name }),
    });
  }

  async rename(path: string[], oldName: string, newName: string): Promise<void> {
    const fullPath = [...path, oldName];
    await request(`${this.baseUrl}/fs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'rename', path: fullPath, newName }),
    });
  }

  // ── Move / Copy ───────────────────────────────────────────────

  async move(sourcePath: string[], destPath: string[], items: ItemReference[]): Promise<void> {
    for (const item of items) {
      const from = [...sourcePath, item.name];
      const to = [...destPath, item.name];
      await request(`${this.baseUrl}/fs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'move', path: from, toPath: to }),
      });
    }
  }

  async copy(sourcePath: string[], destPath: string[], items: ItemReference[]): Promise<void> {
    for (const item of items) {
      const from = [...sourcePath, item.name];
      const to = [...destPath, item.name];
      await request(`${this.baseUrl}/fs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'copy', path: from, toPath: to }),
      });
    }
  }

  // ── Existence checks ──────────────────────────────────────────

  async hasFile(path: string[], filename: string): Promise<boolean> {
    try {
      const data = await request<{ exists: boolean }>(`${this.baseUrl}/fs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'hasfile', path, filename }),
      });
      return data.exists;
    } catch {
      return false;
    }
  }

  async hasFolder(path: string[], folderName: string): Promise<boolean> {
    try {
      const data = await request<{ exists: boolean }>(`${this.baseUrl}/fs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'hasfolder', path, filename: folderName }),
      });
      return data.exists;
    } catch {
      return false;
    }
  }

  // ── Unsupported operations ─────────────────────────────────────

  uploadFile(_path: string[], _file: File): Promise<void> {
    console.warn('File upload not supported via direct file system');
    return Promise.resolve();
  }

  importTree(_destPath: string[], _data: FileSystemNode): Promise<void> {
    return Promise.reject(new Error('Import not supported via direct file system'));
  }
}
