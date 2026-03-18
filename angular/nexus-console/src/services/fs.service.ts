import { Injectable, inject } from '@angular/core';
import { BrokerService } from './broker.service.js';
import { FileSystemNode } from '../models/file-system.model.js';
import { ItemReference } from './file-system-provider.js';

const SERVICE_NAME = 'restFsService';

@Injectable({
  providedIn: 'root'
})
export class FsService {
  private brokerService = inject(BrokerService);

  private constructBrokerUrl(baseUrl: string): string {
    let fullUrl = baseUrl.trim();
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
        fullUrl = `http://${fullUrl}`;
    }
    if (fullUrl.endsWith('/')) {
        fullUrl = fullUrl.slice(0, -1);
    }
    fullUrl += '/api/broker/submitRequest';
    return fullUrl;
  }

  listFiles(brokerUrl: string, token: string, path: string[]): Promise<FileSystemNode[]> {
    return this.brokerService.submitRequest<FileSystemNode[]>(this.constructBrokerUrl(brokerUrl), SERVICE_NAME, 'listFiles', { path, token });
  }

  async getFileContent(brokerUrl: string, token: string, path: string[], filename: string): Promise<string> {
    const response = await this.brokerService.submitRequest<{ content: string }>(this.constructBrokerUrl(brokerUrl), SERVICE_NAME, 'readFile', { path, filename, token });
    return response.content;
  }

  saveFileContent(brokerUrl: string, token: string, path: string[], filename: string, content: string): Promise<void> {
    return this.brokerService.submitRequest(this.constructBrokerUrl(brokerUrl), SERVICE_NAME, 'saveFile', { path, filename, content, token });
  }

  changeDirectory(brokerUrl: string, token: string, path: string[]): Promise<any> {
    return this.brokerService.submitRequest(this.constructBrokerUrl(brokerUrl), SERVICE_NAME, 'changeDirectory', { path, token });
  }

  createDirectory(brokerUrl: string, token: string, path: string[]): Promise<any> {
    return this.brokerService.submitRequest(this.constructBrokerUrl(brokerUrl), SERVICE_NAME, 'createDirectory', { path, token });
  }

  removeDirectory(brokerUrl: string, token: string, path: string[]): Promise<any> {
    return this.brokerService.submitRequest(this.constructBrokerUrl(brokerUrl), SERVICE_NAME, 'removeDirectory', { path, token });
  }

  createFile(brokerUrl: string, token: string, path: string[], filename: string): Promise<any> {
    return this.brokerService.submitRequest(this.constructBrokerUrl(brokerUrl), SERVICE_NAME, 'createFile', { path, filename, token });
  }

  deleteFile(brokerUrl: string, token: string, path: string[], filename: string): Promise<any> {
    return this.brokerService.submitRequest(this.constructBrokerUrl(brokerUrl), SERVICE_NAME, 'deleteFile', { path, filename, token });
  }

  rename(brokerUrl: string, token: string, fromPath: string[], toPath: string[]): Promise<any> {
    return this.brokerService.submitRequest(this.constructBrokerUrl(brokerUrl), SERVICE_NAME, 'rename', { fromPath, toPath, token });
  }

  hasFile(brokerUrl: string, token: string, path: string[], filename: string): Promise<boolean> {
    return this.brokerService.submitRequest<boolean>(this.constructBrokerUrl(brokerUrl), SERVICE_NAME, 'hasFile', { path, filename, token });
  }

  hasFolder(brokerUrl: string, token: string, path: string[], folderName: string): Promise<boolean> {
    return this.brokerService.submitRequest<boolean>(this.constructBrokerUrl(brokerUrl), SERVICE_NAME, 'hasFolder', { path, folderName, token });
  }

  move(brokerUrl: string, token: string, sourcePath: string[], destPath: string[], items: ItemReference[]): Promise<void> {
    return this.brokerService.submitRequest(this.constructBrokerUrl(brokerUrl), SERVICE_NAME, 'moveItems', { sourcePath, destPath, items, token });
  }

  copy(brokerUrl: string, token: string, fromPath: string[], toPath: string[]): Promise<void> {
    return this.brokerService.submitRequest(this.constructBrokerUrl(brokerUrl), SERVICE_NAME, 'copy', { fromPath, toPath, token });
  }
}