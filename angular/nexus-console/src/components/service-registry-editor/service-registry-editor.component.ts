import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, effect } from '@angular/core';
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
    selector: 'app-service-registry-editor',
    imports: [CommonModule, FormsModule],
    templateUrl: './service-registry-editor.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceRegistryEditorComponent {
    profileService = inject(HostProfileService);

    // Input: the profile ID to edit
    profileId = input.required<string>();

    // Output: emit when save is complete
    saved = output<void>();

    // Triggers from toolbar
    saveTrigger = input<{ id: number; paneId: number } | null>(null);
    resetTrigger = input<{ id: number; paneId: number } | null>(null);

    // Output for dirty state tracking
    dirtyStateChange = output<boolean>();

    formState = signal<FormState>({ ...INITIAL_FORM_STATE });
    isDirty = signal(false);
    isSaving = signal(false);
    saveSuccess = signal(false);

    environments: ('DEV' | 'QA' | 'PROD' | 'STAGING')[] = ['DEV', 'PROD', 'QA', 'STAGING'];
    cloudProviders: ('AWS' | 'GCP' | 'AZURE' | 'ON_PREM')[] = ['AWS', 'AZURE', 'GCP', 'ON_PREM'];
    statuses: ('ACTIVE' | 'INACTIVE' | 'MAINTENANCE')[] = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'];

    profile = computed(() =>
        this.profileService.profiles().find(p => p.id === this.profileId())
    );

    constructor() {
        // Load profile data when profileId changes
        effect(() => {
            const profile = this.profile();
            if (profile) {
                this.loadProfileIntoForm(profile);
            }
        });

        // Emit dirty state
        effect(() => {
            this.dirtyStateChange.emit(this.isDirty());
        });

        // Listen for save trigger
        effect(() => {
            const trigger = this.saveTrigger();
            if (trigger) {
                this.saveProfile();
            }
        });

        // Listen for reset trigger
        effect(() => {
            const trigger = this.resetTrigger();
            if (trigger) {
                this.resetForm();
            }
        });
    }

    private loadProfileIntoForm(profile: HostProfile) {
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
        this.isDirty.set(false);
        this.saveSuccess.set(false);
    }

    updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
        this.formState.update(s => ({ ...s, [field]: value }));
        this.isDirty.set(true);
        this.saveSuccess.set(false);
    }

    async saveProfile() {
        const form = this.formState();
        if (!form.name || !form.hostServerUrl) {
            return; // Basic validation
        }

        this.isSaving.set(true);

        const profile: HostProfile = {
            id: form.id,
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

        try {
            await this.profileService.saveProfile(profile);
            this.isDirty.set(false);
            this.saveSuccess.set(true);
            this.saved.emit();

            // Clear success message after 3 seconds
            setTimeout(() => this.saveSuccess.set(false), 3000);
        } finally {
            this.isSaving.set(false);
        }
    }

    resetForm() {
        const profile = this.profile();
        if (profile) {
            this.loadProfileIntoForm(profile);
        }
    }
}
