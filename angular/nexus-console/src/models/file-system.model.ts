export type FileType = 'folder' | 'file' | 'host-server';

export interface FileSystemNode {
  name: string;
  type: FileType;
  children?: FileSystemNode[];
  content?: string; // for files
  modified?: string; // for display
  childrenLoaded?: boolean;
  // Properties for virtual server profile nodes in the tree
  isServerRoot?: boolean;
  profileId?: string;
  connected?: boolean;
  healthStatus?: 'UP' | 'DOWN' | 'UNKNOWN' | 'CHECKING';
  // Properties for magnet folders
  id?: string; // Optional for backward compatibility, but should be present for TreeNodes
  metadata?: Record<string, any>;
  isMagnet?: boolean;
  magnetFile?: string;
  // Virtual organizational folders (like 'Gateways' container)
  isVirtualFolder?: boolean;
}

export interface SearchResultNode extends FileSystemNode {
  path: string[];
}
