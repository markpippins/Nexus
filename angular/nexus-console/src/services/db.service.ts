import { Injectable } from '@angular/core';
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { RssFeed } from '../models/rss-feed.model.js';
import { FolderProperties } from '../models/folder-properties.model.js';
import { Note } from '../models/note.model.js';

const DB_NAME = 'file-explorer-db';
const DB_VERSION = 6;

const FEEDS_STORE = 'rss-feeds';
const FOLDER_PROPERTIES_STORE = 'folder-properties';
const NOTES_STORE = 'notes';

interface FileExplorerDB extends DBSchema {
  [FEEDS_STORE]: {
    key: string;
    value: RssFeed;
  };
  [FOLDER_PROPERTIES_STORE]: {
    key: string;
    value: FolderProperties;
    indexes: { 'by-path': string };
  };
  [NOTES_STORE]: {
    key: string;
    value: Note;
  };
}

@Injectable({ providedIn: 'root' })
export class DbService {
  private dbPromise: Promise<IDBPDatabase<FileExplorerDB>>;

  constructor() {
    this.dbPromise = openDB<FileExplorerDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(FEEDS_STORE)) {
            db.createObjectStore(FEEDS_STORE, { keyPath: 'id' });
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains(FOLDER_PROPERTIES_STORE)) {
            db.createObjectStore(FOLDER_PROPERTIES_STORE, { keyPath: 'path' });
          }
        }
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains(NOTES_STORE)) {
            db.createObjectStore(NOTES_STORE, { keyPath: 'id' });
          }
        }
        if (oldVersion < 5) {
          if (db.objectStoreNames.contains(NOTES_STORE)) {
            db.deleteObjectStore(NOTES_STORE);
          }
          db.createObjectStore(NOTES_STORE, { keyPath: 'id' });
        }
      },
    });
  }

  // --- RSS Feed Methods ---

  async getAllFeeds(): Promise<RssFeed[]> {
    const db = await this.dbPromise;
    return db.getAll(FEEDS_STORE);
  }

  async addFeed(feed: RssFeed): Promise<void> {
    const db = await this.dbPromise;
    await db.put(FEEDS_STORE, feed);
  }

  async updateFeed(feed: RssFeed): Promise<void> {
    const db = await this.dbPromise;
    await db.put(FEEDS_STORE, feed);
  }

  async deleteFeed(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete(FEEDS_STORE, id);
  }

  // --- Folder Properties Methods ---

  async getAllFolderProperties(): Promise<FolderProperties[]> {
    const db = await this.dbPromise;
    return db.getAll(FOLDER_PROPERTIES_STORE);
  }

  async updateFolderProperties(properties: FolderProperties): Promise<void> {
    const db = await this.dbPromise;
    await db.put(FOLDER_PROPERTIES_STORE, properties);
  }

  async deleteFolderProperties(path: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete(FOLDER_PROPERTIES_STORE, path);
  }

  // --- Note Methods ---

  async getNote(id: string): Promise<Note | undefined> {
    const db = await this.dbPromise;
    return db.get(NOTES_STORE, id);
  }

  async saveNote(note: Note): Promise<void> {
    const db = await this.dbPromise;
    await db.put(NOTES_STORE, note);
  }

  async deleteNote(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete(NOTES_STORE, id);
  }

  async getAllNotes(): Promise<Note[]> {
    const db = await this.dbPromise;
    return db.getAll(NOTES_STORE);
  }
}
