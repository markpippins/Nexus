import { Subscription } from 'rxjs';
import { TreeNode, TreeChange } from '../models/tree-node.model.js';

export interface TreeProvider {
    readonly providerType: string;
    canHandle(nodeId: string): boolean;
    getChildren(nodeId: string): Promise<TreeNode[]>;
    executeOperation(nodeId: string, operation: string, params: any): Promise<any>;
    getAvailableOperations(nodeId: string): Promise<string[]>;
    watchChanges(nodeId: string, callback: (changes: TreeChange[]) => void): Subscription;
}
