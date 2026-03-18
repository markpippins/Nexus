import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BrokerProfile } from '../../models/broker-profile.model.js';
import { BrokerProfileService } from '../../services/broker-profile.service.js';

interface FormState {
    id: string;
    name: string;
    brokerUrl: string;
    imageUrl: string;
    autoConnect: boolean;
    healthCheckDelayMinutes: number | null;
}

const INITIAL_FORM_STATE: FormState = {
    id: '',
    name: '',
    brokerUrl: '',
    imageUrl: '',
    autoConnect: false,
    healthCheckDelayMinutes: null,
};

@Component({
    selector: 'app-gateway-editor',
    imports: [CommonModule, FormsModule],
    templateUrl: './gateway-editor.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GatewayEditorComponent {
    profileService = inject(BrokerProfileService);

    // Input: the profile ID to edit
    profileId = input.required<string>();

    // Output: emit when save is complete
    saved = output<void>();
    connectGateway = output<string>();

    // Input: mounted profile IDs for connection status
    mountedProfileIds = input<string[]>([]);

    // Triggers for external actions
    saveTrigger = input<{ id: number; paneId: number } | null>(null);
    resetTrigger = input<{ id: number; paneId: number } | null>(null);

    formState = signal<FormState>({ ...INITIAL_FORM_STATE });
    isDirty = signal(false);
    isSaving = signal(false);
    saveSuccess = signal(false);

    // Output for dirty state tracking
    dirtyStateChange = output<boolean>();

    profile = computed(() =>
        this.profileService.profiles().find(p => p.id === this.profileId())
    );

    isMounted = computed(() => this.mountedProfileIds().includes(this.profileId()));

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

    private loadProfileIntoForm(profile: BrokerProfile) {
        this.formState.set({
            id: profile.id,
            name: profile.name,
            brokerUrl: profile.brokerUrl || '',
            imageUrl: profile.imageUrl || '',
            autoConnect: profile.autoConnect ?? false,
            healthCheckDelayMinutes: profile.healthCheckDelayMinutes ?? null,
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
        if (!form.name.trim()) {
            return; // Basic validation
        }

        this.isSaving.set(true);

        const profile: BrokerProfile = {
            id: form.id,
            name: form.name.trim(),
            brokerUrl: form.brokerUrl.trim(),
            imageUrl: form.imageUrl.trim(),
            autoConnect: form.autoConnect,
            ...(form.healthCheckDelayMinutes && form.healthCheckDelayMinutes > 0 && {
                healthCheckDelayMinutes: form.healthCheckDelayMinutes
            }),
        };

        try {
            await this.profileService.updateProfile(profile);
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
