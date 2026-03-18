import { GenericTreeNode, GenericNodeType } from '../models/generic-tree.model';

export interface ItemReference {
  name: string;
  type: GenericNodeType;
}

export abstract class GenericTreeProvider {
  abstract getContents(path: string[]): Promise<GenericTreeNode[]>;
  abstract getTree(): Promise<GenericTreeNode>;
  abstract rename(path: string[], oldName: string, newName: string): Promise<void>;
  abstract uploadFile(path: string[], file: File): Promise<void>;
  abstract move(sourcePath: string[], destPath: string[], items: ItemReference[]): Promise<void>;
  abstract copy(sourcePath: string[], destPath: string[], items: ItemReference[]): Promise<void>;
  abstract importTree(destPath: string[], data: GenericTreeNode): Promise<void>;
  abstract hasNode(path: string[], nodeName: string): Promise<boolean>;
  abstract hasFolder(path: string[], folderName: string): Promise<boolean>;

  // Default implementations for other methods that can be overridden
  async getNodeContent(path: string[], name: string): Promise<string> {
    throw new Error('getNodeContent not implemented');
  }

  async saveNodeContent(path: string[], name: string, content: string): Promise<void> {
    throw new Error('saveNodeContent not implemented');
  }

  async createFolder(path: string[], name: string): Promise<void> {
    throw new Error('createFolder not implemented');
  }

  async removeFolder(path: string[], name: string): Promise<void> {
    throw new Error('removeFolder not implemented');
  }

  async createNode(path: string[], name: string, type: GenericNodeType): Promise<void> {
    throw new Error('createNode not implemented');
  }

  async deleteNode(path: string[], name: string): Promise<void> {
    throw new Error('deleteNode not implemented');
  }
}