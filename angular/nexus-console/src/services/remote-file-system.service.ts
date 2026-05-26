import { FileSystemProvider, ItemReference } from './file-system-provider.js';
import { FileSystemNode, Mount } from '../models/file-system.model.js';
import { FsService } from './fs.service.js';
import { BrokerProfile } from '../models/broker-profile.model.js';

export class RemoteFileSystemService implements FileSystemProvider {
  private mounts: Mount[] = [];

  constructor(
    public readonly profile: BrokerProfile,
    private fsService: FsService,
    private token: string
  ) { }

  setMounts(mounts: Mount[]): void {
    this.mounts = mounts;
  }

  /** Translate a path whose first segment is a mount name into the backing path. */
  private resolveMountPath(path: string[]): string[] {
    if (path.length === 0 || this.mounts.length === 0) return path;
    const mount = this.mounts.find(m => m.name === path[0]);
    if (mount && mount.rootPath && mount.rootPath.length > 0) {
      return [...mount.rootPath, ...path.slice(1)];
    }
    return path;
  }

  async getContents(path: string[]): Promise<FileSystemNode[]> {
    const resolvedPath = this.resolveMountPath(path);
    const response: any = await this.fsService.listFiles(
      this.profile.brokerUrl ?? '',
      this.token,
      resolvedPath
    );

    let rawItems: any[] = [];

    // First, unwrap the array from the response object
    if (Array.isArray(response)) {
      rawItems = response;
    } else if (response && typeof response === 'object') {
      if (Array.isArray(response.files)) {
        rawItems = response.files;
      } else if (Array.isArray(response.items)) {
        rawItems = response.items;
      }
    }

    if (!rawItems.length && response) {
      if (!Array.isArray(response) && !response.files && !response.items) {
        console.error('Unexpected response structure from file system API:', response);
      }
    }

    // Don't show .magnet files in the listing
    const visibleItems = rawItems.filter(item => item.name !== '.magnet');

    const nodes: FileSystemNode[] = visibleItems.map(item => {
      const itemType = (item.type || '').toLowerCase();
      const isFolder = itemType === 'folder' || itemType === 'directory';
      return {
        name: item.name,
        type: isFolder ? 'folder' : 'file',
        modified: item.modified,
        content: item.content,
      };
    });

    const folderNodes = nodes.filter(node => node.type === 'folder');

    // Asynchronously check each folder for the presence of a .magnet file.
    // This is extensible for other file/folder decorators in the future.
    if (folderNodes.length > 0) {
      const magnetChecks = folderNodes.map(folder =>
        this.hasFile([...resolvedPath, folder.name], '.magnet').catch(() => false) // Gracefully handle errors
      );

      const magnetResults = await Promise.all(magnetChecks);

      folderNodes.forEach((folder, index) => {
        if (magnetResults[index]) {
          folder.isMagnet = true;
          folder.magnetFile = '.magnet';
        }
      });
    }

    return nodes;
  }

  getFileContent(path: string[], name: string): Promise<string> {
    return this.fsService.getFileContent(this.profile.brokerUrl ?? '', this.token, this.resolveMountPath(path), name);
  }

  saveFileContent(path: string[], name: string, content: string): Promise<void> {
    return this.fsService.saveFileContent(this.profile.brokerUrl ?? '', this.token, this.resolveMountPath(path), name, content);
  }

  listMounts(): Promise<Mount[]> {
    return this.fsService.listMounts(this.profile.brokerUrl ?? '', this.token);
  }

  async getFolderTree(): Promise<FileSystemNode> {
    // When mounts are available, show mount nodes as children instead of raw root directory
    if (this.mounts.length > 0) {
      const mountChildren: FileSystemNode[] = this.mounts.map(mount => ({
        name: mount.name,
        type: 'folder',
        children: [],
        childrenLoaded: false,
        metadata: { mountId: mount.id, rootPath: mount.rootPath },
      }));

      return {
        name: this.profile.name,
        type: 'folder',
        children: mountChildren,
        childrenLoaded: true,
      };
    }

    // Fallback to raw root directory listing when no mounts exist
    const topLevelItems = await this.getContents([]);
    const children = topLevelItems.map((item): FileSystemNode => {
      if (item.type === 'folder') {
        return {
          ...item,
          children: [],
          childrenLoaded: false, // Mark for lazy loading
        };
      }
      return item;
    });

    return {
      name: this.profile.name,
      type: 'folder',
      children: children,
      childrenLoaded: true, // The root's direct children are now loaded
    };
  }

  hasFile(path: string[], filename: string): Promise<boolean> {
    return this.fsService.hasFile(this.profile.brokerUrl ?? '', this.token, this.resolveMountPath(path), filename);
  }

  hasFolder(path: string[], folderName: string): Promise<boolean> {
    return this.fsService.hasFolder(this.profile.brokerUrl ?? '', this.token, this.resolveMountPath(path), folderName);
  }

  createDirectory(path: string[], name: string): Promise<void> {
    return this.fsService.createDirectory(this.profile.brokerUrl ?? '', this.token, [...this.resolveMountPath(path), name]);
  }

  async removeDirectory(path: string[], name: string): Promise<void> {
    const resolved = this.resolveMountPath(path);
    await this.fsService.removeDirectory(this.profile.brokerUrl ?? '', this.token, [...resolved, name]);
  }

  createFile(path: string[], name: string): Promise<void> {
    return this.fsService.createFile(this.profile.brokerUrl ?? '', this.token, this.resolveMountPath(path), name);
  }

  deleteFile(path: string[], name: string): Promise<void> {
    return this.fsService.deleteFile(this.profile.brokerUrl ?? '', this.token, this.resolveMountPath(path), name);
  }

  async rename(path: string[], oldName: string, newName: string): Promise<void> {
    const resolved = this.resolveMountPath(path);
    const fromPath = [...resolved, oldName];
    const toPath = [...resolved, newName];
    await this.fsService.rename(this.profile.brokerUrl ?? '', this.token, fromPath, toPath);
  }

  move(sourcePath: string[], destPath: string[], items: ItemReference[]): Promise<void> {
    return this.fsService.move(this.profile.brokerUrl ?? '', this.token, this.resolveMountPath(sourcePath), this.resolveMountPath(destPath), items);
  }

  async copy(sourcePath: string[], destPath: string[], items: ItemReference[]): Promise<void> {
    const resolvedSource = this.resolveMountPath(sourcePath);
    const resolvedDest = this.resolveMountPath(destPath);
    const copyPromises = items.map(item => {
      const fromPath = [...resolvedSource, item.name];
      const toPath = [...resolvedDest, item.name];
      return this.fsService.copy(this.profile.brokerUrl ?? '', this.token, fromPath, toPath);
    });
    await Promise.all(copyPromises);
  }

  uploadFile(path: string[], file: File): Promise<void> {
    console.warn(`File upload not implemented in live mode. File: ${file.name}, Path: ${path.join('/')}`);
    return Promise.resolve();
  }

  importTree(destPath: string[], data: FileSystemNode): Promise<void> {
    return Promise.reject(new Error('Import operation is not supported for remote file systems.'));
  }
}