import { FileSystemProvider } from './file-system-provider.js';
import { TreeProvider } from './tree-provider.interface.js';
import { FileSystemNode } from '../models/file-system.model.js';
import { TreeNode, NodeType } from '../models/tree-node.model.js';

export class TreeProviderAdapter implements FileSystemProvider {
    constructor(
        private treeProvider: TreeProvider,
        private rootNodeId: string = 'root'
    ) { }

    private mapNode(node: TreeNode): FileSystemNode {
        return {
            name: node.name,
            type: node.type === NodeType.FILE ? 'file' : 'folder',
            id: node.id,
            metadata: node.metadata,
            children: [], // Don't populate children initially - they will be loaded on demand
            childrenLoaded: false, // Children are not loaded until the node is expanded
            isServerRoot: false // node.type === NodeType.ROOT ?
        };
    }

    // This is a naive implementation that assumes we can find the node by traversing names.
    // In a real implementation, we might need a path-to-id service or cache.
    private async resolveNodeId(path: string[]): Promise<string> {
        if (path.length === 0) return this.rootNodeId;

        let currentId = this.rootNodeId;
        for (const segment of path) {
            const children = await this.treeProvider.getChildren(currentId);
            const child = children.find(c => c.name === segment);
            if (!child) {
                throw new Error(`Node not found: ${segment} in ${currentId}`);
            }
            currentId = child.id;
        }
        return currentId;
    }

    async getContents(path: string[]): Promise<FileSystemNode[]> {
        const nodeId = await this.resolveNodeId(path);
        const children = await this.treeProvider.getChildren(nodeId);
        return children.map(node => this.mapNode(node));
    }

    async getFolderTree(): Promise<FileSystemNode> {
        // For the getFolderTree method, we need to return the root node of this provider
        // Since this is an adapter for a specific node, we'll create a representation of that node
        // The actual children will be loaded via getContents when the node is expanded

        return {
            name: this.getNodeNameFromId(this.rootNodeId), // Get appropriate name for the root node
            type: 'folder',
            id: this.rootNodeId,
            children: [], // Children will be loaded on demand via getContents
            childrenLoaded: false,
            isServerRoot: false
        };
    }

    private getNodeNameFromId(nodeId: string): string {
        // Simple mapping based on known node IDs
        switch (nodeId) {
            case 'platform': return 'Platform Management';
            case 'users': return 'Users';
            case 'search': return 'Search & Discovery';
            case 'filesystems': return 'File Systems';
            case 'servers': return 'Servers';
            default:
                if (nodeId.startsWith('host-')) {
                    // Extract name from host-<profileId> format
                    return `Host-${nodeId.substring(5)}`;
                }
                return nodeId.charAt(0).toUpperCase() + nodeId.slice(1);
        }
    }

    // Read-only for now
    async createDirectory(path: string[], name: string): Promise<void> { throw new Error('Not implemented'); }
    async removeDirectory(path: string[], name: string): Promise<void> { throw new Error('Not implemented'); }
    async createFile(path: string[], name: string): Promise<void> { throw new Error('Not implemented'); }
    async deleteFile(path: string[], name: string): Promise<void> { throw new Error('Not implemented'); }
    async rename(path: string[], oldName: string, newName: string): Promise<void> { throw new Error('Not implemented'); }
    async uploadFile(path: string[], file: File): Promise<void> { throw new Error('Not implemented'); }
    async move(sourcePath: string[], destPath: string[], items: { name: string; type: "folder" | "file"; }[]): Promise<void> { throw new Error('Not implemented'); }
    async copy(sourcePath: string[], destPath: string[], items: { name: string; type: "folder" | "file"; }[]): Promise<void> { throw new Error('Not implemented'); }
    async importTree(path: string[], tree: FileSystemNode): Promise<void> { throw new Error('Not implemented'); }
    async getFileContent(path: string[], filename: string): Promise<string> { throw new Error('Not implemented'); }
    async saveFileContent(path: string[], filename: string, content: string): Promise<void> { throw new Error('Not implemented'); }
    async hasFile(path: string[], filename: string): Promise<boolean> { return false; }
    async hasFolder(path: string[], foldername: string): Promise<boolean> { return false; }
}
