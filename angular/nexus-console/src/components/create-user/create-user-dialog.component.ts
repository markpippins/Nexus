import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CreateUserComponent } from './create-user.component';
import { BrokerProfile } from '../../models/broker-profile.model';

@Component({
  selector: 'app-create-user-dialog',
  standalone: true,
  imports: [
    CommonModule,
    CreateUserComponent
  ],
  template: `
    @if (isOpen()) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backbone-dialog-overlay"
        (click)="close.emit()"
      >
        <div
          class="bg-[rgb(var(--color-surface-dialog))] text-[rgb(var(--color-text-base))] rounded-lg shadow-xl w-full max-w-lg overflow-hidden border border-[rgb(var(--color-border-base))] transform transition-all"
          (click)="$event.stopPropagation()"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between px-6 py-4 border-b border-[rgb(var(--color-border-base))] bg-[rgb(var(--color-surface))]"
          >
            <h2 class="text-xl font-semibold text-[rgb(var(--color-text-prominent))]">
              Create User
            </h2>
            <button
              (click)="close.emit()"
              class="text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-base))] transition-colors p-1 rounded-md hover:bg-[rgb(var(--color-surface-hover))]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <!-- Content -->
          <div class="p-6">
            <app-create-user
              [profile]="profile()"
              (userCreated)="onUserCreated($event)"
              (closeRequest)="close.emit()">
            </app-create-user>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    /* No custom styles needed, using Tailwind classes */
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreateUserDialogComponent {
  isOpen = input<boolean>(false);
  profile = input<BrokerProfile | undefined>(undefined);
  close = output<void>();
  submitUser = output<{ email: string, alias: string, identifier: string }>();

  onUserCreated(userData: { email: string, alias: string, identifier: string }): void {
    this.submitUser.emit(userData);
    this.close.emit();
  }
}