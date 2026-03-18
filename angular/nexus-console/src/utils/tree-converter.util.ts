import { GenericTreeNode } from '../models/generic-tree.model';
import { FileSystemNode, FileType } from '../models/file-system.model';
import { NodeType } from '../models/tree-node.model';

/**
 * Converts a GenericTreeNode to a FileSystemNode
 */
export function convertToFileSystemNode(node: GenericTreeNode): FileSystemNode {
  // Map the generic node type to the file system type
  let fileType: FileType = 'folder';
  if (node.type === 'file' || node.type === NodeType.FILE) {
    fileType = 'file';
  } else if (node.type === 'host-server' || node.type === NodeType.HOST_SERVER) {
    fileType = 'host-server';
  }

  const fileSystemNode: FileSystemNode = {
    name: node.name,
    type: fileType,
    id: node.id,
    metadata: node.metadata,
    modified: node.modified,
    childrenLoaded: node.childrenLoaded,
    isServerRoot: node.isServerRoot,
    profileId: node.profileId,
    connected: node.connected,
    content: node.content,
    isMagnet: node.isMagnet,
    magnetFile: node.magnetFile,
    isVirtualFolder: node.isVirtualNode, // Map the new property to the old one
  };

  if (node.children) {
    fileSystemNode.children = node.children.map(convertToFileSystemNode);
  }

  return fileSystemNode;
}

/**
 * Converts a FileSystemNode to a GenericTreeNode
 */
export function convertToGenericTreeNode(node: FileSystemNode): GenericTreeNode {
  const genericNode: GenericTreeNode = {
    name: node.name,
    type: node.type,
    id: node.id,
    metadata: node.metadata,
    modified: node.modified,
    childrenLoaded: node.childrenLoaded,
    isServerRoot: node.isServerRoot,
    profileId: node.profileId,
    connected: node.connected,
    content: node.content,
    isMagnet: node.isMagnet,
    magnetFile: node.magnetFile,
    isVirtualNode: node.isVirtualFolder, // Map the old property to the new one
  };

  if (node.children) {
    genericNode.children = node.children.map(convertToGenericTreeNode);
  }

  return genericNode;
}