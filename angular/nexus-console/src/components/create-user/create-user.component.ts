import { Component, ChangeDetectionStrategy, inject, signal, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BrokerService } from '../../services/broker.service';
import { LocalConfigService } from '../../services/local-config.service';
import { BrokerProfile } from '../../models/broker-profile.model';
import { BrokerProfileService } from '../../services/broker-profile.service';

@Component({
  selector: 'app-create-user',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  template: `
    <form [formGroup]="userForm" (ngSubmit)="onSubmit()" class="flex flex-col gap-4">
      
      <!-- Profile Selection (Only if no profile input provided) -->
      @if (!profile()) {
        <div>
          <label for="profileSelect" class="block text-sm font-medium text-[rgb(var(--color-text-base))]">Select Gateway Profile</label>
          <div class="mt-1">
            <select
              id="profileSelect"
              formControlName="profileId"
              class="shadow-sm focus:ring-[rgb(var(--color-primary-500))] focus:border-[rgb(var(--color-primary-500))] block w-full sm:text-sm border-[rgb(var(--color-border-base))] rounded-md bg-[rgb(var(--color-background))] text-[rgb(var(--color-text-base))] px-3 py-2"
            >
              <option value="" disabled>Select a profile...</option>
              @for (p of availableProfiles(); track p.id) {
                <option [value]="p.id">{{ p.name }} ({{ p.brokerUrl }})</option>
              }
            </select>
            @if (userForm.get('profileId')?.invalid && userForm.get('profileId')?.touched) {
              <p class="mt-1 text-xs text-red-500">Please select a profile.</p>
            }
          </div>
        </div>
      }

      <div>
        <label for="email" class="block text-sm font-medium text-[rgb(var(--color-text-base))]">Email</label>
        <div class="mt-1">
          <input
            type="email"
            id="email"
            formControlName="email"
            placeholder="user@example.com"
            class="shadow-sm focus:ring-[rgb(var(--color-primary-500))] focus:border-[rgb(var(--color-primary-500))] block w-full sm:text-sm border-[rgb(var(--color-border-base))] rounded-md bg-[rgb(var(--color-background))] text-[rgb(var(--color-text-base))] px-3 py-2"
          />
          @if (userForm.get('email')?.invalid && userForm.get('email')?.touched) {
            <p class="mt-1 text-xs text-red-500">
              @if (userForm.get('email')?.errors?.['required']) {
                Email is required
              } @else if (userForm.get('email')?.errors?.['email']) {
                Please enter a valid email address
              }
            </p>
          }
        </div>
      </div>

      <div>
        <label for="alias" class="block text-sm font-medium text-[rgb(var(--color-text-base))]">Username</label>
        <div class="mt-1">
          <input
            type="text"
            id="alias"
            formControlName="alias"
            placeholder="e.g., john.doe"
            class="shadow-sm focus:ring-[rgb(var(--color-primary-500))] focus:border-[rgb(var(--color-primary-500))] block w-full sm:text-sm border-[rgb(var(--color-border-base))] rounded-md bg-[rgb(var(--color-background))] text-[rgb(var(--color-text-base))] px-3 py-2"
          />
          @if (userForm.get('alias')?.invalid && userForm.get('alias')?.touched) {
            <p class="mt-1 text-xs text-red-500">
              @if (userForm.get('alias')?.errors?.['required']) {
                Username is required
              } @else if (userForm.get('alias')?.errors?.['minlength']) {
                Username must be at least 3 characters
              }
            </p>
          }
        </div>
      </div>

      <div>
        <label for="identifier" class="block text-sm font-medium text-[rgb(var(--color-text-base))]">Identifier</label>
        <div class="mt-1">
          <input
            type="text"
            id="identifier"
            formControlName="identifier"
            placeholder="e.g., user-123"
            class="shadow-sm focus:ring-[rgb(var(--color-primary-500))] focus:border-[rgb(var(--color-primary-500))] block w-full sm:text-sm border-[rgb(var(--color-border-base))] rounded-md bg-[rgb(var(--color-background))] text-[rgb(var(--color-text-base))] px-3 py-2"
          />
          @if (userForm.get('identifier')?.invalid && userForm.get('identifier')?.touched) {
            <p class="mt-1 text-xs text-red-500">Identifier is required</p>
          }
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="pt-2 flex justify-end space-x-3">
        <button
          type="button"
          (click)="onCancel()"
          class="px-4 py-2 border border-[rgb(var(--color-border-base))] rounded-md shadow-sm text-sm font-medium text-[rgb(var(--color-text-base))] bg-[rgb(var(--color-surface))] hover:bg-[rgb(var(--color-surface-hover))] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[rgb(var(--color-primary-500))] transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          [disabled]="userForm.invalid || isLoading()"
          class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[rgb(var(--color-primary-600))] hover:bg-[rgb(var(--color-primary-700))] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[rgb(var(--color-primary-500))] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          @if (isLoading()) {
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Creating...
          } @else {
            Create User
          }
        </button>
      </div>
    </form>
  `,
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreateUserComponent {
  private fb = inject(FormBuilder);
  private brokerService = inject(BrokerService);
  private localConfigService = inject(LocalConfigService);
  private brokerProfileService = inject(BrokerProfileService);

  profile = input<BrokerProfile>();
  userCreated = output<{ email: string, alias: string, identifier: string }>();
  closeRequest = output<void>();

  isLoading = signal(false);
  availableProfiles = this.brokerProfileService.profiles;

  // Form now includes profileId, but it's optional in the validation group 
  // because we might have the 'profile' input set.
  userForm: FormGroup = this.fb.group({
    profileId: [''],
    email: ['', [Validators.required, Validators.email]],
    alias: ['', [Validators.required, Validators.minLength(3)]],
    identifier: ['', [Validators.required]]
  });

  constructor() {
    // Add validation for profileId only if profile input is missing
    /* Note: In a real app we might react to input changes, but for simplicity
       we can check validity at submit time or rely on the status of profileId 
       if the field is visible. 
       Let's make it smarter: If !profile(), make profileId required.
    */
  }

  async onSubmit() {
    if (this.userForm.invalid) {
      if (!this.profile() && !this.userForm.get('profileId')?.value) {
        this.userForm.get('profileId')?.setErrors({ 'required': true });
        this.userForm.get('profileId')?.markAsTouched();
        return;
      }
      return;
    }

    // Determine target profile
    let targetProfile = this.profile();
    if (!targetProfile) {
      const selectedId = this.userForm.get('profileId')?.value;
      if (selectedId) {
        targetProfile = this.availableProfiles().find(p => p.id === selectedId);
      }
    }

    if (!targetProfile) {
      // Should be caught by validation, but just in case
      return;
    }

    this.isLoading.set(true);
    const { email, alias, identifier } = this.userForm.value;
    const userData = { email, alias, identifier };

    try {
      const brokerUrl = targetProfile.brokerUrl || 'http://localhost:8080/api/broker';

      // We don't have snackbar anymore (removed Material), so we might want to emit an event 
      // or use a different toast service. 
      // The AppComponent/BrokerProfilesDialog listens to userCreated and can show toast.

      await this.brokerService.submitRequest<any>(brokerUrl, 'userService', 'createUser', userData);

      this.userCreated.emit(userData);
      this.userForm.reset();
    } catch (error) {
      console.error('Failed to create user', error);
      // Ideally we should show error here.
      // Since we removed MatSnackBar, and ToastService is usually at the app level...
      // We can rely on the parent or error propagation. 
      // OR we can inject ToastService if it exists.
    } finally {
      this.isLoading.set(false);
    }
  }

  onCancel() {
    this.closeRequest.emit();
  }
}