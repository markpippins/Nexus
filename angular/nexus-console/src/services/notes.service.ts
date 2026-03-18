import { Injectable, inject } from '@angular/core';
import { DbService } from './db.service.js';
import { Note } from '../models/note.model.js';
import { BrokerService } from './broker.service.js';
import { BrokerProfileService } from './broker-profile.service.js';
import { LocalConfigService } from './local-config.service.js';

@Injectable({
  providedIn: 'root',
})
export class NotesService {
  private dbService = inject(DbService);
  private brokerService = inject(BrokerService);
  private brokerProfileService = inject(BrokerProfileService);
  private localConfigService = inject(LocalConfigService);

  private tokens = new Map<string, string>();

  setToken(profileId: string, token: string): void {
    this.tokens.set(profileId, token);
  }

  removeToken(profileId: string): void {
    this.tokens.delete(profileId);
  }

  isConnected(path: string[]): boolean {
    if (path.length === 0) { // Home root is always connected
      return true;
    }

    const rootName = path[0];
    const profile = this.brokerProfileService.profiles().find(p => p.name === rootName);

    // If no profile matches, or it's the local session, it's connected.
    if (!profile || rootName === this.localConfigService.sessionName()) {
      return true;
    }

    // It's a remote path. Check for token.
    return this.tokens.has(profile.id);
  }

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

  private getNoteInfoFromPath(path: string[]): { id: string; source: string; key: string } {
    const source = path[0] ?? 'Nexus';
    let key: string;
    if (path.length === 0) {
      key = '__HOME_NOTE__';
    } else {
      key = path.slice(1).join('/');
    }
    const id = `${source}::${key}`;
    return { id, source, key };
  }

  async getNote(path: string[]): Promise<Note | undefined> {
    if (path.length === 0) { // Home root is always local
      const { id } = this.getNoteInfoFromPath(path);
      return this.dbService.getNote(id);
    }

    const rootName = path[0];
    const profile = this.brokerProfileService.profiles().find(p => p.name === rootName);

    // If no profile matches, or it's the local session, use the local DB.
    if (!profile || rootName === this.localConfigService.sessionName()) {
      const { id } = this.getNoteInfoFromPath(path);
      return this.dbService.getNote(id);
    }

    // It's a remote path. Check for connection.
    const token = this.tokens.get(profile.id);
    if (!token) {
      console.warn(`Not connected to remote profile: ${rootName}, cannot fetch note.`);
      return undefined;
    }

    const { source, key } = this.getNoteInfoFromPath(path);
    try {
      const params = { token, source, key };
      const note = await this.brokerService.submitRequest<Note | null>(
        this.constructBrokerUrl(profile.brokerUrl),
        'noteService',
        'getNote',
        params
      );
      return note ?? undefined;
    } catch (e) {
      console.error(`Failed to fetch remote note for path ${path.join('/')}. This may be expected if no note exists.`, e);
      return undefined;
    }
  }

  async saveNote(path: string[], content: string): Promise<void> {
    if (path.length === 0) { // Home root is always local
      const { id, source, key } = this.getNoteInfoFromPath(path);
      const note: Note = { id, source, key, content };
      await this.dbService.saveNote(note);
      return;
    }

    const rootName = path[0];
    const profile = this.brokerProfileService.profiles().find(p => p.name === rootName);

    // If no profile matches, or it's the local session, use the local DB.
    if (!profile || rootName === this.localConfigService.sessionName()) {
      const { id, source, key } = this.getNoteInfoFromPath(path);
      const note: Note = { id, source, key, content };
      await this.dbService.saveNote(note);
      return;
    }

    // It's a remote path.
    const token = this.tokens.get(profile.id);
    if (!token) {
      throw new Error(`Cannot save note: Not connected to remote profile: ${rootName}.`);
    }

    const { source, key } = this.getNoteInfoFromPath(path);
    try {
      const params = { token, source, key, content };
      await this.brokerService.submitRequest(
        this.constructBrokerUrl(profile.brokerUrl),
        'noteService',
        'saveNote',
        params
      );
    } catch (e) {
      console.error(`Failed to save remote note for path ${path.join('/')}`, e);
      throw e;
    }
  }

  async deleteNote(path: string[]): Promise<void> {
    if (path.length === 0) { // Home root is always local
      const { id } = this.getNoteInfoFromPath(path);
      await this.dbService.deleteNote(id);
      return;
    }

    const rootName = path[0];
    const profile = this.brokerProfileService.profiles().find(p => p.name === rootName);


    // If no profile matches, or it's the local session, use the local DB.
    if (!profile || rootName === this.localConfigService.sessionName()) {
      const { id } = this.getNoteInfoFromPath(path);
      await this.dbService.deleteNote(id);
      return;
    }

    // It's a remote path.
    const token = this.tokens.get(profile.id);
    if (!token) {
      throw new Error(`Cannot delete note: Not connected to remote profile: ${rootName}.`);
    }

    const { source, key } = this.getNoteInfoFromPath(path);
    try {
      const params = { token, source, key };
      await this.brokerService.submitRequest(
        this.constructBrokerUrl(profile.brokerUrl),
        'noteService',
        'deleteNote',
        params
      );
    } catch (e) {
      console.error(`Failed to delete remote note for path ${path.join('/')}`, e);
      throw e;
    }
  }

  getAllNotes(): Promise<Note[]> {
    return this.dbService.getAllNotes();
  }

  private getNoteFullPath(note: Note): string {
    if (note.source === 'Nexus' && note.key === '__HOME_NOTE__') {
      return ''; // Root path
    }
    // Reconstruct the full path string used by FolderPropertiesService
    return [note.source, note.key].filter(Boolean).join('/');
  }

  async renameNotesForPrefix(oldPathPrefix: string, newPathPrefix: string): Promise<void> {
    if (oldPathPrefix === newPathPrefix) return;

    const allNotes = await this.getAllNotes();
    const updates: Promise<any>[] = [];

    for (const note of allNotes) {
      const notePath = this.getNoteFullPath(note);

      if (notePath === oldPathPrefix) {
        const newPath = newPathPrefix.split('/');
        // We delete from DB directly and then use the service's saveNote to repopulate.
        // `saveNote` doesn't need to be async awaited inside the loop for performance.
        updates.push(this.dbService.deleteNote(note.id));
        updates.push(this.saveNote(newPath, note.content));
      } else if (notePath.startsWith(oldPathPrefix + '/')) {
        const subPath = notePath.substring(oldPathPrefix.length); // e.g., /subfolder
        const newFullPath = newPathPrefix + subPath;
        const newPath = newFullPath.split('/');
        updates.push(this.dbService.deleteNote(note.id));
        updates.push(this.saveNote(newPath, note.content));
      }
    }
    await Promise.all(updates);
  }

  async deleteNotesForPrefix(pathPrefix: string): Promise<void> {
    const allNotes = await this.getAllNotes();
    const deletes: Promise<any>[] = [];
    for (const note of allNotes) {
      const notePath = this.getNoteFullPath(note);
      if (notePath === pathPrefix || notePath.startsWith(pathPrefix + '/')) {
        deletes.push(this.dbService.deleteNote(note.id));
      }
    }
    await Promise.all(deletes);
  }
}