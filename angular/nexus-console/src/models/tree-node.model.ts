export enum NodeType {
    ROOT = 'root',
    SERVICE = 'service',
    USER = 'user',
    FILE = 'file',
    FOLDER = 'folder',
    SEARCH_RESULT = 'search-result',
    VIRTUAL_FOLDER = 'virtual-folder',
    HEALTH_CHECK = 'health-check',
    LOG_ENTRY = 'log-entry',
    HOST_SERVER = 'host-server'
}

export enum NodeStatus {
    HEALTHY = 'healthy',
    UNHEALTHY = 'unhealthy',
    DEGRADED = 'degraded',
    OFFLINE = 'offline',
    UNKNOWN = 'unknown'
}

export interface TreeNode {
    id: string;                    // Unique identifier
    name: string;                  // Display name
    type: NodeType;                // Node type for icon/behavior
    parentId?: string;             // Parent node ID
    icon: string;                  // Icon identifier
    status?: NodeStatus;           // Health/availability status
    metadata: Record<string, any>; // Type-specific data
    operations: string[];          // Available operations
    hasChildren: boolean;          // Lazy loading indicator
    isExpanded?: boolean;          // UI state
    lastUpdated: Date;             // Cache invalidation
    children?: TreeNode[];         // Optional children for in-memory or pre-loaded structures
}

export interface TreeChange {
    type: 'added' | 'removed' | 'modified' | 'moved';
    nodeId: string;
    node?: TreeNode;
    oldParentId?: string;
    newParentId?: string;
}

export interface CreateNodeRequest {
    name: string;
    type: NodeType;
    metadata?: Record<string, any>;
}

export interface SearchFilters {
    type?: NodeType[];
    status?: NodeStatus[];
    metadata?: Record<string, any>;
}
