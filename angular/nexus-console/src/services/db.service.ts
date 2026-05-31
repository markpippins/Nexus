import { Injectable } from '@angular/core';
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { BrokerProfile } from '../models/broker-profile.model.js';
import { RegistryServerProfile } from '../models/registry-server-profile.model.js';
import { RssFeed } from '../models/rss-feed.model.js';
import { FolderProperties } from '../models/folder-properties.model.js';
import { Note } from '../models/note.model.js';

const DB_NAME = 'file-explorer-db';
const DB_VERSION = 7;
const PROFILES_STORE = 'server-profiles'; // Legacy
const BROKER_PROFILES_STORE = 'broker-profiles';
const HOST_PROFILES_STORE = 'host-profiles'; // Keep old store name for IndexedDB compatibility

const FEEDS_STORE = 'rss-feeds';
const FOLDER_PROPERTIES_STORE = 'folder-properties';
const NOTES_STORE = 'notes';

interface FileExplorerDB extends DBSchema {
  [BROKER_PROFILES_STORE]: {
    key: string;
    value: BrokerProfile;
  };
  [HOST_PROFILES_STORE]: {
    key: string;
    value: RegistryServerProfile;
  };

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
  // Legacy support for migration type checking if needed
  [PROFILES_STORE]: {
    key: string;
    value: any;
  };
}

@Injectable({
  providedIn: 'root',
})
export class DbService {
  private dbPromise: Promise<IDBPDatabase<FileExplorerDB>>;

  constructor() {
    this.dbPromise = openDB<FileExplorerDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(PROFILES_STORE)) {
            db.createObjectStore(PROFILES_STORE, { keyPath: 'id' });
          }
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
        if (oldVersion < 7) {
          if (!db.objectStoreNames.contains(HOST_PROFILES_STORE)) {
            db.createObjectStore(HOST_PROFILES_STORE, { keyPath: 'id' });
          }
        }
        if (oldVersion < 6) {
          if (!db.objectStoreNames.contains(BROKER_PROFILES_STORE)) {
            db.createObjectStore(BROKER_PROFILES_STORE, { keyPath: 'id' });

            // Attempt to migrate data from server-profiles if it exists
            if (db.objectStoreNames.contains(PROFILES_STORE)) {
              const oldStore = transaction.objectStore(PROFILES_STORE);
              const newStore = transaction.objectStore(BROKER_PROFILES_STORE);
              // We can use a cursor to iterate and copy
              (async () => {
                let cursor = await oldStore.openCursor();
                while (cursor) {
                  const profile = cursor.value;
                  // Map ServerProfile to BrokerProfile: keep common fields. 
                  if (!profile.type || profile.type === 'broker') {
                    await newStore.put(profile);
                  }
                  cursor = await cursor.continue();
                }
              })();
            }
          }
        }
      },
    });
  }

  // --- Broker Profile Methods ---

  async getAllProfiles(): Promise<BrokerProfile[]> {
    const db = await this.dbPromise;
    return db.getAll(BROKER_PROFILES_STORE);
  }

  async addProfile(profile: BrokerProfile): Promise<void> {
    const db = await this.dbPromise;
    await db.put(BROKER_PROFILES_STORE, profile);
  }

  async updateProfile(profile: BrokerProfile): Promise<void> {
    const db = await this.dbPromise;
    await db.put(BROKER_PROFILES_STORE, profile);
  }

  async deleteProfile(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete(BROKER_PROFILES_STORE, id);
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

  // --- Registry Server Profile Methods ---

  async getAllRegistryServerProfiles(): Promise<RegistryServerProfile[]> {
    const db = await this.dbPromise;
    return db.getAll(HOST_PROFILES_STORE);
  }

  async addRegistryServerProfile(profile: RegistryServerProfile): Promise<void> {
    const db = await this.dbPromise;
    await db.put(HOST_PROFILES_STORE, profile);
  }

  async updateRegistryServerProfile(profile: RegistryServerProfile): Promise<void> {
    const db = await this.dbPromise;
    await db.put(HOST_PROFILES_STORE, profile);
  }

  async deleteRegistryServerProfile(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete(HOST_PROFILES_STORE, id);
  }
}