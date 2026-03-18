// Generic tree node type that can represent any kind of hierarchical entity
export type GenericNodeType = 'folder' | 'file' | 'host-server' | 'service' | 'user' | 'gateway' | 'registry' | 'platform' | 'search' | 'virtual-folder' | string;

export interface GenericTreeNode {
  id?: string;                   // Unique identifier (optional for backward compatibility)
  name: string;                  // Display name
  type: GenericNodeType;         // Node type for icon/behavior
  children?: GenericTreeNode[];  // Child nodes
  childrenLoaded?: boolean;      // Lazy loading indicator
  metadata?: Record<string, any>; // Type-specific data
  icon?: string;                 // Icon identifier
  status?: string;               // Health/availability status (can be extended as needed)

  // Properties for virtual organizational nodes
  isVirtualNode?: boolean;       // For virtual organizational containers

  // Properties for server/connection nodes
  isServerRoot?: boolean;        // For server profile nodes
  profileId?: string;            // Associated profile ID
  connected?: boolean;           // Connection status

  // Properties for file-like nodes
  content?: string;              // For file content
  modified?: string;             // Modification timestamp

  // Properties for special functionality
  isMagnet?: boolean;            // For magnetized folders
  magnetFile?: string;           // Magnet file reference
}

// Extended interface for search results
export interface SearchResultNode extends GenericTreeNode {
  path: string[];
}

// Enum for common node statuses (can be extended as needed)
export enum NodeStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  DEGRADED = 'degraded',
  OFFLINE = 'offline',
  UNKNOWN = 'unknown'
}