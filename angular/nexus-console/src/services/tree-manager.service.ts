import { Injectable, inject } from '@angular/core';
import { Subscription, Subject } from 'rxjs';
import { TreeNode, NodeType, TreeChange, CreateNodeRequest, SearchFilters } from '../models/tree-node.model.js';
import { TreeProvider } from './tree-provider.interface.js';

@Injectable({
    providedIn: 'root'
})
export class TreeManagerService {
    private providers: TreeProvider[] = [];

    registerProvider(provider: TreeProvider) {
        this.providers.push(provider);
    }

    private getProviderForNode(nodeId: string): TreeProvider | undefined {
        return this.providers.find(p => p.canHandle(nodeId));
    }

    async getChildren(nodeId: string): Promise<TreeNode[]> {
        const provider = this.getProviderForNode(nodeId);
        if (!provider) {
            console.warn(`No provider found for node ${nodeId}`);
            return [];
        }
        return provider.getChildren(nodeId);
    }

    async getParent(nodeId: string): Promise<TreeNode | null> {
        // This is tricky because providers might not know about parents if they are just handling a subtree.
        // We might need to cache the tree structure or ask providers.
        // For now, returning null as placeholder.
        return null;
    }

    async getNodePath(nodeId: string): Promise<TreeNode[]> {
        // Placeholder
        return [];
    }

    async createNode(parentId: string, node: CreateNodeRequest): Promise<TreeNode> {
        const provider = this.getProviderForNode(parentId);
        if (!provider) {
            throw new Error(`No provider found for parent node ${parentId}`);
        }
        // We need to extend TreeProvider to support createNode if we want to delegate this.
        // The current interface doesn't have createNode.
        // Assuming executeOperation might handle it or we need to update the interface.
        // For now, throwing error.
        throw new Error('Method not implemented.');
    }

    async deleteNode(nodeId: string): Promise<void> {
        const provider = this.getProviderForNode(nodeId);
        if (!provider) {
            throw new Error(`No provider found for node ${nodeId}`);
        }
        // Delegate to provider via executeOperation or specific method?
        // The interface has executeOperation.
        return provider.executeOperation(nodeId, 'delete', {});
    }

    async moveNode(nodeId: string, newParentId: string): Promise<void> {
        throw new Error('Method not implemented.');
    }

    async renameNode(nodeId: string, newName: string): Promise<TreeNode> {
        const provider = this.getProviderForNode(nodeId);
        if (!provider) {
            throw new Error(`No provider found for node ${nodeId}`);
        }
        return provider.executeOperation(nodeId, 'rename', { newName });
    }

    watchNode(nodeId: string, callback: (changes: TreeChange[]) => void): Subscription {
        const provider = this.getProviderForNode(nodeId);
        if (!provider) {
            return new Subscription();
        }
        return provider.watchChanges(nodeId, callback);
    }

    async refreshSubtree(nodeId: string): Promise<void> {
        // Trigger refresh logic
    }

    async refreshAll(): Promise<void> {
        // Trigger refresh logic for all roots
    }

    async getAvailableOperations(nodeId: string): Promise<string[]> {
        const provider = this.getProviderForNode(nodeId);
        if (!provider) {
            return [];
        }
        return provider.getAvailableOperations(nodeId);
    }

    async executeOperation(nodeId: string, operation: string, params: any): Promise<any> {
        const provider = this.getProviderForNode(nodeId);
        if (!provider) {
            throw new Error(`No provider found for node ${nodeId}`);
        }
        return provider.executeOperation(nodeId, operation, params);
    }

    async searchNodes(query: string, filters?: SearchFilters): Promise<TreeNode[]> {
        // Delegate to SearchProvider or iterate all providers?
        // For now, placeholder.
        return [];
    }

    async findNodesByType(nodeType: string): Promise<TreeNode[]> {
        // Placeholder
        return [];
    }
}
