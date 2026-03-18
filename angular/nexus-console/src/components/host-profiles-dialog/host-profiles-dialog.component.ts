import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HostProfile } from '../../models/host-profile.model.js';
import { HostProfileService } from '../../services/host-profile.service.js';

interface FormState {
    id: string;
    name: string;
    hostServerUrl: string;
    imageUrl: string;
    hostname: string;
    ipAddress: string;
    environment: 'DEV' | 'QA' | 'PROD' | 'STAGING';
    operatingSystem: string;
    cpuCores: number | null;
    memoryMb: number | null;
    diskGb: number | null;
    region: string;
    cloudProvider: 'AWS' | 'GCP' | 'AZURE' | 'ON_PREM';
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
    description: string;
}

const INITIAL_FORM_STATE: FormState = {
    id: '',
    name: '',
    hostServerUrl: '',
    imageUrl: '',
    hostname: '',
    ipAddress: '',
    environment: 'DEV',
    operatingSystem: '',
    cpuCores: null,
    memoryMb: null,
    diskGb: null,
    region: '',
    cloudProvider: 'AWS',
    status: 'ACTIVE',
    description: ''
};

@Component({
    selector: 'app-host-profiles-dialog',
    imports: [CommonModule, FormsModule],
    templateUrl: './host-profiles-dialog.component.html',
    styleUrls: ['./host-profiles-dialog.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HostProfilesDialogComponent {
    profileService = inject(HostProfileService);

    isOpen = input<boolean>(false);
    close = output<void>();

    selectedProfileId = signal<string | null>(null);
    isEditing = signal(false);

    formState = signal<FormState>({ ...INITIAL_FORM_STATE });

    environments: ('DEV' | 'QA' | 'PROD' | 'STAGING')[] = ['DEV', 'PROD', 'QA', 'STAGING'];
    cloudProviders: ('AWS' | 'GCP' | 'AZURE' | 'ON_PREM')[] = ['AWS', 'AZURE', 'GCP', 'ON_PREM'];
    statuses: ('ACTIVE' | 'INACTIVE' | 'MAINTENANCE')[] = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'];

    selectedProfile = computed(() =>
        this.profileService.profiles().find(p => p.id === this.selectedProfileId())
    );

    startAddNew() {
        this.formState.set({ ...INITIAL_FORM_STATE, id: this.generateUUID() });
        this.selectedProfileId.set(null);
        this.isEditing.set(true);
    }

    private generateUUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    startEdit(profile: HostProfile) {
        this.selectedProfileId.set(profile.id);
        this.formState.set({
            id: profile.id,
            name: profile.name,
            hostServerUrl: profile.hostServerUrl,
            imageUrl: profile.imageUrl,
            hostname: profile.hostname || '',
            ipAddress: profile.ipAddress || '',
            environment: profile.environment || 'DEV',
            operatingSystem: profile.operatingSystem || '',
            cpuCores: profile.cpuCores || null,
            memoryMb: profile.memoryMb || null,
            diskGb: profile.diskGb || null,
            region: profile.region || '',
            cloudProvider: profile.cloudProvider || 'AWS',
            status: profile.status || 'ACTIVE',
            description: profile.description || ''
        });
        this.isEditing.set(true);
    }

    cancelEdit() {
        this.isEditing.set(false);
        this.selectedProfileId.set(null);
    }

    async saveProfile() {
        const form = this.formState();
        if (!form.name || !form.hostServerUrl) {
            return; // Basic validation
        }

        const profile: HostProfile = {
            id: form.id || this.generateUUID(),
            name: form.name,
            hostServerUrl: form.hostServerUrl,
            imageUrl: form.imageUrl,
            hostname: form.hostname,
            ipAddress: form.ipAddress,
            environment: form.environment,
            operatingSystem: form.operatingSystem,
            cpuCores: form.cpuCores ?? undefined,
            memoryMb: form.memoryMb ?? undefined,
            diskGb: form.diskGb ?? undefined,
            region: form.region,
            cloudProvider: form.cloudProvider,
            status: form.status,
            description: form.description
        };

        await this.profileService.saveProfile(profile);
        this.isEditing.set(false);
        this.selectedProfileId.set(null);
    }

    async deleteProfile(profileId: string) {
        if (confirm('Are you sure you want to delete this profile?')) {
            await this.profileService.deleteProfile(profileId);
            if (this.selectedProfileId() === profileId) {
                this.selectedProfileId.set(null);
            }
        }
    }

    updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
        this.formState.update(s => ({ ...s, [field]: value }));
    }

    async setActive(profileId: string) {
        await this.profileService.setActiveProfile(profileId);
    }

    onClose() {
        this.close.emit();
    }
}
