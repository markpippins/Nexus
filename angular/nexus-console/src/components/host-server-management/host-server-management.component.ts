import { ChangeDetectionStrategy, Component, inject, input, output, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HostProfileService } from '../../services/host-profile.service.js';
import { HostProfile } from '../../models/host-profile.model.js';

@Component({
  selector: 'app-host-server-management',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="h-full flex flex-col bg-[rgb(var(--color-surface))]">


      <div class="flex-1 overflow-auto p-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          @for (profile of profiles(); track profile.id) {
            <div (dblclick)="editServiceRegistry.emit(profile.name)" class="group relative flex flex-col bg-[rgb(var(--color-surface-muted))] rounded-xl border border-[rgb(var(--color-border-base))] hover:border-[rgb(var(--color-accent-ring))] hover:shadow-md transition-all duration-300">
              <div class="p-5 flex-1">
                <div class="flex items-start justify-between mb-4">
                  <div class="flex items-center gap-3">
                    <div class="p-3 rounded-lg bg-[rgb(var(--color-primary-600))]/10 text-[rgb(var(--color-primary-600))]">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                      </svg>
                    </div>
                    <div>
                      <h3 class="font-bold text-[rgb(var(--color-text-prominent))] group-hover:text-[rgb(var(--color-accent-solid-bg))] transition-colors">
                        {{ profile.name }}
                      </h3>
                      <p class="text-xs text-[rgb(var(--color-text-muted))] truncate max-w-[200px]" [title]="profile.hostServerUrl">
                        {{ profile.hostServerUrl || 'No Server URL' }}
                      </p>
                    </div>
                  </div>
                  <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      (click)="editServiceRegistry.emit(profile.name)"
                      title="Edit Service Registry"
                      class="p-1.5 rounded-md hover:bg-[rgb(var(--color-surface-hover))] text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-accent-solid-bg))]"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      (click)="deleteServiceRegistry.emit(profile.id)"
                      title="Delete Service Registry"
                      class="p-1.5 rounded-md hover:bg-[rgb(var(--color-danger-bg))] text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-danger-text))]"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4 mt-4">
                  <div class="flex flex-col">
                    <span class="text-[10px] uppercase tracking-wider text-[rgb(var(--color-text-subtle))]">Environment</span>
                    <span class="text-xs font-medium text-[rgb(var(--color-text-base))]">
                      {{ profile.environment || 'DEV' }}
                    </span>
                  </div>
                   <div class="flex flex-col">
                    <span class="text-[10px] uppercase tracking-wider text-[rgb(var(--color-text-subtle))]">Status</span>
                    <span class="text-xs font-medium" [class.text-[rgb(var(--color-success-text))]]="profile.status === 'ACTIVE'" [class.text-[rgb(var(--color-danger-text))]]="profile.status === 'INACTIVE'">
                      {{ profile.status || 'ACTIVE' }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="px-5 py-3 bg-[rgb(var(--color-surface-hover-subtle))] border-t border-[rgb(var(--color-border-muted))] rounded-b-xl flex justify-end">
                <button
                  (click)="editServiceRegistry.emit(profile.name)"
                  class="text-xs font-bold text-[rgb(var(--color-accent-solid-bg))] hover:underline uppercase tracking-wide"
                >
                  Edit Profile
                </button>
              </div>
            </div>
          } @empty {
            <div class="col-span-full py-20 flex flex-col items-center justify-center text-[rgb(var(--color-text-muted))]">
              <div class="p-6 rounded-full bg-[rgb(var(--color-surface-muted))] mb-4 border border-dashed border-[rgb(var(--color-border-muted))]">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
              <p class="text-lg font-medium">No Service Registries Configured</p>
              <p class="text-sm">Click "Add New Service Registry" to get started.</p>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HostServerManagementComponent {
  profileService = inject(HostProfileService);

  profiles = this.profileService.profiles;
  toolbarAction = input<{ name: string; payload?: any; id: number } | null>(null);

  editServiceRegistry = output<string>();
  deleteServiceRegistry = output<string>();
  addServiceRegistry = output<void>();

  private lastProcessedActionId = 0;
  private componentStartTime = Date.now();

  constructor() {
    effect(() => {
      const action = this.toolbarAction();
      if (action) {
        // Ignore actions that happened before this component was created
        const isNewAction = action.id > this.componentStartTime;

        if (isNewAction && action.id !== this.lastProcessedActionId) {
          this.lastProcessedActionId = action.id;
          if (action.name === 'newFolder') {
            this.addServiceRegistry.emit();
          }
        } else {
          this.lastProcessedActionId = action.id;
        }
      }
    });
  }
}
