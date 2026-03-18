import { Injectable, inject, signal, computed } from '@angular/core';
import { HostProfile } from '../models/host-profile.model.js';
import { DbService } from './db.service.js';

@Injectable({
    providedIn: 'root'
})
export class HostProfileService {
    private dbService = inject(DbService);

    readonly profiles = signal<HostProfile[]>([{
        id: 'default-local-host',
        name: 'Local Host',
        hostServerUrl: 'http://localhost:8085',
        imageUrl: '',
        description: 'Default local host server',
        isActive: true // Default profile is active by default
    }]);

    /**
     * Computed signal that returns the currently active host profile.
     * Falls back to the first profile if none is explicitly marked as active.
     */
    readonly activeProfile = computed<HostProfile | null>(() => {
        const allProfiles = this.profiles();
        // First, try to find an explicitly active profile
        const active = allProfiles.find(p => p.isActive === true);
        if (active) {
            return active;
        }
        // Fallback: return the first profile if available
        return allProfiles.length > 0 ? allProfiles[0] : null;
    });

    /**
     * Computed signal that returns the active profile's base URL.
     * Useful for services that need just the URL.
     */
    readonly activeBaseUrl = computed<string | null>(() => {
        const profile = this.activeProfile();
        if (!profile) return null;

        let url = profile.hostServerUrl;
        if (!url.startsWith('http')) {
            url = `http://${url}`;
        }
        if (url.endsWith('/')) {
            url = url.slice(0, -1);
        }
        return url;
    });

    constructor() {
        this.loadProfiles();
    }

    async loadProfiles(): Promise<void> {
        const profiles = await this.dbService.getAllHostProfiles();
        // If DB has profiles, use them. Otherwise keep the default.
        if (profiles.length > 0) {
            // Ensure at least one profile is active
            const hasActive = profiles.some(p => p.isActive === true);
            if (!hasActive && profiles.length > 0) {
                profiles[0].isActive = true;
            }
            this.profiles.set(profiles);
            console.log('[HostProfileService] Loaded profiles from DB', profiles);
            console.log('[HostProfileService] Active profile:', profiles.find(p => p.isActive)?.name);
        } else {
            console.log('[HostProfileService] Using default profile');
        }
    }

    /**
     * Set a specific profile as the active one.
     * This will deactivate all other profiles and activate the specified one.
     */
    async setActiveProfile(profileId: string): Promise<void> {
        const updatedProfiles = this.profiles().map(p => ({
            ...p,
            isActive: p.id === profileId
        }));

        // Update all profiles in the database
        for (const profile of updatedProfiles) {
            await this.dbService.updateHostProfile(profile);
        }

        this.profiles.set(updatedProfiles);
        console.log('[HostProfileService] Set active profile:', profileId);
    }

    async saveProfile(profile: HostProfile): Promise<void> {
        const existing = this.profiles().find(p => p.id === profile.id);
        if (existing) {
            await this.dbService.updateHostProfile(profile);
            this.profiles.update(current =>
                current.map(p => p.id === profile.id ? profile : p)
            );
        } else {
            // If this is the first profile, make it active
            if (this.profiles().length === 0) {
                profile.isActive = true;
            }
            await this.dbService.addHostProfile(profile);
            this.profiles.update(current => [...current, profile]);
        }
    }

    async deleteProfile(profileId: string): Promise<void> {
        const profileToDelete = this.profiles().find(p => p.id === profileId);
        const wasActive = profileToDelete?.isActive === true;

        await this.dbService.deleteHostProfile(profileId);
        this.profiles.update(current => current.filter(p => p.id !== profileId));

        // If we deleted the active profile, make the first remaining profile active
        if (wasActive) {
            const remaining = this.profiles();
            if (remaining.length > 0) {
                await this.setActiveProfile(remaining[0].id);
            }
        }
    }
}
