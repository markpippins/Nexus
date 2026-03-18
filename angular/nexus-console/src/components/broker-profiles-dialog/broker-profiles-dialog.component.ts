import { Component, ChangeDetectionStrategy, output, inject, signal, input, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrokerProfileService } from '../../services/broker-profile.service.js';
import { BrokerProfile } from '../../models/broker-profile.model.js';
import { User } from '../../models/user.model.js';
import { LoginDialogComponent } from '../login-dialog/login-dialog.component.js';
import { ToastService } from '../../services/toast.service.js';
import { CreateUserDialogComponent } from '../create-user/create-user-dialog.component.js';

type FormState = {
  id: string | null;
  name: string;
  brokerUrl: string;
  imageUrl: string;
  autoConnect: boolean;
  healthCheckDelayMinutes: number | null;
}

@Component({
  selector: 'app-broker-profiles-dialog',
  standalone: true,
  templateUrl: './broker-profiles-dialog.component.html',
  imports: [CommonModule, LoginDialogComponent, CreateUserDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown.escape)': 'close.emit()',
  },
})
export class BrokerProfilesDialogComponent implements OnInit {
  profileService = inject(BrokerProfileService);
  toastService = inject(ToastService);

  mountedProfileIds = input<string[]>([]);
  mountedProfileUsers = input<Map<string, User>>(new Map());
  initialProfileForEdit = input<BrokerProfile | null>(null);

  close = output<void>();
  loginAndMount = output<{ profile: BrokerProfile, username: string, password: string }>();
  unmountProfile = output<BrokerProfile>();
  profileRenamed = output<{ oldName: string, newName: string, profile: BrokerProfile }>();

  selectedProfileId = signal<string | null>(null);

  // Form state for editing/creating
  formState = signal<FormState | null>(null);

  // State for login dialog
  isLoginDialogOpen = signal(false);
  profileToLogin = signal<BrokerProfile | null>(null);

  // State for create user dialog
  isCreateUserDialogOpen = signal(false);
  profileForUserCreation = signal<BrokerProfile | null>(null);

  private originalProfileName: string | null = null;

  // Computed signal to find the full profile object when editing.
  selectedProfile = computed(() => {
    const form = this.formState();
    if (form && form.id) {
      return this.profileService.profiles().find(p => p.id === form.id) ?? null;
    }
    return null;
  });

  ngOnInit(): void {
    const profileToEdit = this.initialProfileForEdit();
    if (profileToEdit) {
      this.startEdit(profileToEdit);
    }
  }

  startAddNew(): void {
    this.formState.set({
      id: null,
      name: '',
      brokerUrl: '',
      imageUrl: '',
      autoConnect: false,
      healthCheckDelayMinutes: null,
    });
    this.selectedProfileId.set(null);
    this.originalProfileName = null;
  }

  startEdit(profile: BrokerProfile): void {
    this.formState.set({
      ...profile,
      brokerUrl: profile.brokerUrl ?? '',
      autoConnect: profile.autoConnect ?? false,
      healthCheckDelayMinutes: profile.healthCheckDelayMinutes ?? null
    });
    this.selectedProfileId.set(profile.id);
    this.originalProfileName = profile.name;
  }

  cancelEdit(): void {
    this.formState.set(null);
    this.selectedProfileId.set(null);
    this.originalProfileName = null;
  }

  async saveProfile(): Promise<void> {
    const state = this.formState();
    if (!state || !state.name.trim()) return;

    if (state.id) { // Editing existing
      const oldName = this.originalProfileName;

      const updatedProfile: BrokerProfile = {
        id: state.id,
        name: state.name.trim(),
        brokerUrl: state.brokerUrl.trim(),
        imageUrl: state.imageUrl.trim(),
        autoConnect: state.autoConnect,
        ...(state.healthCheckDelayMinutes && state.healthCheckDelayMinutes > 0 && { healthCheckDelayMinutes: state.healthCheckDelayMinutes }),
      };

      await this.profileService.updateProfile(updatedProfile);
      this.toastService.show(`Profile "${updatedProfile.name}" updated.`);

      if (oldName && oldName !== updatedProfile.name) {
        this.profileRenamed.emit({ oldName, newName: updatedProfile.name, profile: updatedProfile });
      }
      this.originalProfileName = updatedProfile.name;
    } else { // Adding new
      const newProfileData: Omit<BrokerProfile, 'id'> = {
        name: state.name.trim(),
        brokerUrl: state.brokerUrl.trim(),
        imageUrl: state.imageUrl.trim(),
        autoConnect: state.autoConnect,
        ...(state.healthCheckDelayMinutes && state.healthCheckDelayMinutes > 0 && { healthCheckDelayMinutes: state.healthCheckDelayMinutes }),
      };

      await this.profileService.addProfile(newProfileData);
      this.toastService.show(`Profile "${newProfileData.name}" created.`);
      this.formState.set(null);
      this.selectedProfileId.set(null);
      this.originalProfileName = null;
    }
  }

  async deleteProfile(id: string): Promise<void> {
    if (confirm('Are you sure you want to delete this profile?')) {
      const profileToUnmount = this.profileService.profiles().find(p => p.id === id);
      if (profileToUnmount && this.mountedProfileIds().includes(id)) {
        this.unmountProfile.emit(profileToUnmount);
      }
      await this.profileService.deleteProfile(id);
      if (this.formState()?.id === id) {
        this.formState.set(null);
      }
      this.selectedProfileId.set(null);
    }
  }

  openLoginDialog(profile: BrokerProfile): void {
    this.profileToLogin.set(profile);
    this.isLoginDialogOpen.set(true);
  }

  closeLoginDialog(): void {
    this.isLoginDialogOpen.set(false);
    this.profileToLogin.set(null);
  }

  onLoginSubmitted({ username, password }: { username: string, password: string }): void {
    const profile = this.profileToLogin();
    if (profile) {
      this.loginAndMount.emit({ profile, username, password });
    }
    this.closeLoginDialog();
  }

  openCreateUserDialog(profile: BrokerProfile): void {
    this.profileForUserCreation.set(profile);
    this.isCreateUserDialogOpen.set(true);
  }

  closeCreateUserDialog(): void {
    this.isCreateUserDialogOpen.set(false);
    this.profileForUserCreation.set(null);
  }

  onCreateUserSubmitted(userData: { email: string, alias: string, identifier: string }): void {
    // For now, just close the dialog - in a real implementation you would send the user creation request
    this.toastService.show(`Creating user ${userData.alias} on ${this.profileForUserCreation()?.name || 'server'}...`);
    this.closeCreateUserDialog();
  }

  handleUnmount(profile: BrokerProfile): void {
    this.unmountProfile.emit(profile);
  }

  onFormValueChange(event: Event, field: keyof Omit<FormState, 'id' | 'autoConnect' | 'healthCheckDelayMinutes'>): void {
    const value = (event.target as HTMLInputElement).value;
    this.formState.update(state => state ? { ...state, [field]: value } : null);
  }

  onNumberValueChange(event: Event, field: 'healthCheckDelayMinutes'): void {
    const value = (event.target as HTMLInputElement).value;
    this.formState.update(state => state ? { ...state, [field]: value ? parseInt(value, 10) : null } : null);
  }

  onCheckboxChange(event: Event, field: 'autoConnect'): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.formState.update(state => state ? { ...state, [field]: checked } : null);
  }
}