import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { BrokerProfile } from '../models/broker-profile.model.js';
import { TopologyClientService } from './topology-client.service.js';

const ACTIVE_PROFILE_ID_STORAGE_KEY = 'file-explorer-active-broker-profile-id';

/** Backend entity shape from topology-server */
interface BrokerProfileEntity {
  id: number;
  profileId: string;
  name: string;
  brokerUrl: string;
  imageUrl: string;
  autoConnect: boolean;
  healthCheckDelayMinutes: number;
}

function entityToModel(e: BrokerProfileEntity): BrokerProfile {
  return {
    id: e.profileId,
    name: e.name,
    brokerUrl: e.brokerUrl,
    imageUrl: e.imageUrl,
    autoConnect: e.autoConnect,
    healthCheckDelayMinutes: e.healthCheckDelayMinutes,
  };
}

function modelToEntity(p: BrokerProfile): Partial<BrokerProfileEntity> {
  return {
    profileId: p.id,
    name: p.name,
    brokerUrl: p.brokerUrl,
    imageUrl: p.imageUrl,
    autoConnect: p.autoConnect,
    healthCheckDelayMinutes: p.healthCheckDelayMinutes,
  };
}

@Injectable({ providedIn: 'root' })
export class BrokerProfileService {
  private topology = inject(TopologyClientService);
  profiles = signal<BrokerProfile[]>([]);
  activeProfileId = signal<string | null>(null);

  activeProfile = computed<BrokerProfile | null>(() => {
    const profiles = this.profiles();
    const activeId = this.activeProfileId();
    if (!activeId) return null;
    return profiles.find(p => p.id === activeId) ?? null;
  });

  activeConfig = computed<{ brokerUrl: string; imageUrl: string }>(() => {
    const active = this.activeProfile();
    if (active) {
      return { brokerUrl: active.brokerUrl, imageUrl: active.imageUrl ?? '' };
    }
    const first = this.profiles()[0];
    return { brokerUrl: first?.brokerUrl ?? 'localhost:8081', imageUrl: first?.imageUrl ?? 'http://localhost:9081' };
  });

  constructor() {
    this.loadProfiles();
    effect(() => {
      try {
        const id = this.activeProfileId();
        if (id) localStorage.setItem(ACTIVE_PROFILE_ID_STORAGE_KEY, id);
        else localStorage.removeItem(ACTIVE_PROFILE_ID_STORAGE_KEY);
      } catch {}
    });
  }

  private async loadProfiles(): Promise<void> {
    try {
      const entities = await this.topology.get<BrokerProfileEntity>('broker-profiles');
      const models = entities.map(entityToModel);
      this.profiles.set(models.sort((a, b) => a.name.localeCompare(b.name)));

      const activeId = localStorage.getItem(ACTIVE_PROFILE_ID_STORAGE_KEY);
      if (activeId && this.profiles().some(p => p.id === activeId)) {
        this.activeProfileId.set(activeId);
      } else {
        this.activeProfileId.set(this.profiles()[0]?.id ?? null);
      }
    } catch {
      console.warn('[BrokerProfileService] Failed to load from topology-server');
      this.profiles.set([]);
    }
  }

  async addProfile(data: Omit<BrokerProfile, 'id'>): Promise<void> {
    const payload: any = { profileId: `profile-${Date.now()}`, ...data };
    const entity = await this.topology.post<BrokerProfileEntity>('broker-profiles', payload);
    this.profiles.update(p => [...p, entityToModel(entity)].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async updateProfile(profile: BrokerProfile): Promise<void> {
    const entities = await this.topology.get<BrokerProfileEntity>('broker-profiles');
    const match = entities.find(e => e.profileId === profile.id);
    if (!match) return;
    await this.topology.put('broker-profiles', match.id, modelToEntity(profile));
    this.profiles.update(p =>
      p.map(x => x.id === profile.id ? profile : x).sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  async deleteProfile(id: string): Promise<void> {
    const entities = await this.topology.get<BrokerProfileEntity>('broker-profiles');
    const match = entities.find(e => e.profileId === id);
    if (!match) return;
    await this.topology.delete('broker-profiles', match.id);
    this.profiles.update(p => p.filter(x => x.id !== id));
    if (this.activeProfileId() === id) {
      this.activeProfileId.set(this.profiles()[0]?.id ?? null);
    }
  }

  setActiveProfile(id: string): void {
    if (this.profiles().some(p => p.id === id)) {
      this.activeProfileId.set(id);
    }
  }
}
