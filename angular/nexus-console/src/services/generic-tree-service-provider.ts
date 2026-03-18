import { Injectable } from '@angular/core';
import { GenericTreeProvider } from './generic-tree-provider';
import { GenericTreeNode } from '../models/generic-tree.model';
import { NodeType } from '../models/tree-node.model';
import { SessionService } from './in-memory-file-system.service';
import { BrokerProfileService } from './broker-profile.service';
import { HostProfileService } from './host-profile.service';
import { RegistryServerProvider } from './registry-server-provider.service';

@Injectable({
  providedIn: 'root'
})
export class GenericTreeServiceProvider extends GenericTreeProvider {
  constructor(
    private sessionFs: SessionService,
    private profileService: BrokerProfileService,
    private hostProfileService: HostProfileService,
    private registryServerProvider: RegistryServerProvider
  ) {
    super();
  }

  async getContents(path: string[]): Promise<GenericTreeNode[]> {
    // For now, delegate to the existing homeProvider logic but return GenericTreeNode objects
    // This would be a more complex implementation in a real scenario
    throw new Error('Method not implemented.');
  }

  async getNodeContent(path: string[], name: string): Promise<string> {
    throw new Error('Method not implemented.');
  }

  async saveNodeContent(path: string[], name: string, content: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async getTree(): Promise<GenericTreeNode> {
    // Build a combined tree similar to buildCombinedFolderTree but using GenericTreeNode
    const sessionTree = await this.sessionFs.getFolderTree();

    // Convert sessionTree (FileSystemNode) to GenericTreeNode
    const convertToGenericNode = (node: any): GenericTreeNode => {
      const genericNode: GenericTreeNode = {
        id: node.id || '',
        name: node.name,
        type: node.type || 'folder',
        children: node.children ? node.children.map(convertToGenericNode) : undefined,
        childrenLoaded: node.childrenLoaded,
        metadata: node.metadata,

        status: node.metadata?.status,
        isVirtualNode: node.isVirtualFolder,
        isServerRoot: node.isServerRoot,
        profileId: node.profileId,
        connected: node.connected,
        content: node.content,
        modified: node.modified,
        isMagnet: node.isMagnet,
        magnetFile: node.magnetFile
      };

      return genericNode;
    };

    const convertedSessionTree = convertToGenericNode(sessionTree);

    // Get host server children
    const hostChildren = await this.registryServerProvider.getChildren('root');
    const hostNodes: GenericTreeNode[] = hostChildren.map(node => {
      // Convert NodeType to GenericNodeType
      let genericType: 'folder' | 'file' | 'service' | 'user' | 'host-server' | 'gateway' | 'registry' | 'platform' | 'search' | 'virtual-folder' | string = 'folder';

      switch (node.type) {
        case NodeType.SERVICE:
          genericType = 'service';
          break;
        case NodeType.USER:
          genericType = 'user';
          break;
        case NodeType.HOST_SERVER:
          genericType = 'host-server';
          break;
        case NodeType.FILE:
          genericType = 'file';
          break;
        case NodeType.VIRTUAL_FOLDER:
          genericType = 'virtual-folder';
          break;
        case NodeType.ROOT:
          genericType = 'folder';
          break;
        default:
          genericType = node.type.toString();
      }

      return {
        id: node.id,
        name: node.name,
        type: genericType,
        children: [],
        childrenLoaded: false,
        metadata: node.metadata,

        status: node.status?.toString(),
        isServerRoot: false
      };
    });

    // Build broker gateway nodes
    const allBrokerProfiles = this.profileService.profiles();
    const mountedIds = new Set<string>(); // Simplified - would need to get from actual service
    const brokerProfileNodes: GenericTreeNode[] = allBrokerProfiles.map(p => ({
      id: p.id,
      name: p.name,
      type: 'gateway',
      isServerRoot: true,
      profileId: p.id,
      connected: mountedIds.has(p.id),
      modified: mountedIds.has(p.id) ? new Date().toISOString() : undefined,
      children: [],
      childrenLoaded: false,
    }));

    // Build host server profile nodes
    const allHostProfiles = this.hostProfileService.profiles();
    const hostProfileNodes: GenericTreeNode[] = allHostProfiles.map(p => ({
      id: p.id,
      name: p.name,
      type: 'registry',
      isServerRoot: true,
      profileId: p.id,
      connected: true,
      children: [],
      childrenLoaded: false,
    }));

    // Create virtual organization nodes
    const gatewaysNode: GenericTreeNode = {
      id: 'gateways-container',
      name: 'Gateways',
      type: 'virtual-folder',
      children: brokerProfileNodes,
      childrenLoaded: true,
      isVirtualNode: true,
    };

    const serviceRegistriesNode: GenericTreeNode = {
      id: 'registries-container',
      name: 'Service Registries',
      type: 'virtual-folder',
      children: hostProfileNodes,
      childrenLoaded: true,
      isVirtualNode: true,
    };

    // Build the root tree
    return {
      id: 'root',
      name: 'Nexus',
      type: 'folder',
      children: [
        ...hostNodes,
        ...(brokerProfileNodes.length > 0 ? [gatewaysNode] : []),
      ],
      childrenLoaded: true,
    };
  }

  async createFolder(path: string[], name: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async removeFolder(path: string[], name: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async createNode(path: string[], name: string, type: 'folder' | 'file' | 'service' | 'user' | 'host-server' | 'gateway' | 'registry' | 'platform' | 'search' | 'virtual-folder' | string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async deleteNode(path: string[], name: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async rename(path: string[], oldName: string, newName: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async uploadFile(path: string[], file: File): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async move(sourcePath: string[], destPath: string[], items: import("./generic-tree-provider").ItemReference[]): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async copy(sourcePath: string[], destPath: string[], items: import("./generic-tree-provider").ItemReference[]): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async importTree(destPath: string[], data: GenericTreeNode): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async hasNode(path: string[], nodeName: string): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  async hasFolder(path: string[], folderName: string): Promise<boolean> {
    return Promise.resolve(false);
  }
}