import { Injectable, signal, effect, computed } from '@angular/core';

const CONFIG_STORAGE_KEY = 'file-explorer-local-config';

/** Canonical Image Server URL. 8081 is the Broker Gateway port — never a valid
 * image-server address. Persisted configs from before 2026-08-12 may still
 * carry the stale 8081 default (auto-saved by the save effect), so loadConfig()
 * rewrites it on read. */
const IMAGE_SERVER_URL = 'http://localhost:9081';
const STALE_IMAGE_SERVER_URLS = ['http://localhost:8081', 'http://localhost:8081/'];

export interface LocalConfig {
  sessionName: string;
  defaultImageUrl: string;
  terrainServerUrl: string;
  logBrokerMessages: boolean;
  healthCheckDelayMinutes: number;
}

const DEFAULT_CONFIG: LocalConfig = {
  sessionName: 'Local Session',
  defaultImageUrl: IMAGE_SERVER_URL, // Image Server (typescript/image-server) — 8081 is Broker Gateway
  terrainServerUrl: 'http://localhost:8084',
  logBrokerMessages: true,
  healthCheckDelayMinutes: 3,
};

@Injectable({
  providedIn: 'root',
})
export class LocalConfigService {
  private config = signal<LocalConfig>(DEFAULT_CONFIG);
  
  public readonly sessionName = computed(() => this.config().sessionName);
  public readonly defaultImageUrl = computed(() => this.config().defaultImageUrl);
  public readonly terrainServerUrl = computed(() => this.config().terrainServerUrl);
  public readonly currentConfig = this.config.asReadonly();

  constructor() {
    this.loadConfig();
    effect(() => {
      this.saveConfig();
    });
  }

  private loadConfig(): void {
    try {
      const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle missing properties from older versions
        const mergedConfig = { ...DEFAULT_CONFIG, ...parsed };
        // Migrate stale 8081 image-server URLs (8081 is Broker Gateway) → 9081
        if (STALE_IMAGE_SERVER_URLS.includes(mergedConfig.defaultImageUrl)) {
          mergedConfig.defaultImageUrl = IMAGE_SERVER_URL;
          console.warn(`[LocalConfigService] Migrated stale defaultImageUrl (8081 → ${IMAGE_SERVER_URL})`);
        }
        this.config.set(mergedConfig);
        return;
      }
    } catch (e) {
      console.error('Failed to load local config from localStorage', e);
    }
    // Set default if loading fails or nothing is stored
    this.config.set(DEFAULT_CONFIG);
  }

  private saveConfig(): void {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(this.config()));
    } catch (e) {
      console.error('Failed to save local config to localStorage', e);
    }
  }

  updateConfig(newConfig: Partial<LocalConfig>): void {
    this.config.update(current => ({ ...current, ...newConfig }));
  }
}
