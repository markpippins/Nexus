import { ChangeDetectionStrategy, Component, inject, input, output, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlatformManagementService, ServiceLibraryPayload } from '../../../services/platform-management.service.js';
import { Library, ServiceLibrary, ServiceInstance, DependencyScope } from '../../../models/service-mesh.model.js';

@Component({
    selector: 'app-service-libraries-dialog',
    imports: [CommonModule, FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
            <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" (click)="onClose()" (window:keydown.escape)="onClose()">
            <div class="bg-[rgb(var(--color-surface-dialog))] rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden flex flex-col" (click)="$event.stopPropagation()">
                <!-- Header -->
                <div class="flex items-center justify-between p-4 border-b border-[rgb(var(--color-border-base))]">
                    <h2 class="text-lg font-semibold text-[rgb(var(--color-text-base))]">
                        Manage Libraries for {{ service()?.name }}
                    </h2>
                    <button
                        (click)="onClose()"
                        class="text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-base))] transition-colors"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <div class="flex-1 overflow-y-auto p-4 space-y-4">
                    <!-- Current Dependencies -->
                    <div>
                        <h3 class="text-sm font-medium text-[rgb(var(--color-text-muted))] mb-2">Current Dependencies ({{ serviceLibraries().length }})</h3>
                        @if (serviceLibraries().length === 0) {
                            <p class="text-sm text-[rgb(var(--color-text-muted))] italic">No libraries added yet.</p>
                        } @else {
                            <div class="space-y-2">
                                @for (sl of serviceLibraries(); track sl.id) {
                                    <div class="flex items-center justify-between p-3 bg-[rgb(var(--color-surface-hover))] rounded-md">
                                        <div class="flex-1">
                                            <div class="font-medium text-[rgb(var(--color-text-base))]">{{ sl.library?.name }}</div>
                                            <div class="text-sm text-[rgb(var(--color-text-muted))]">
                                                v{{ sl.version }}
                                                @if (sl.scope && sl.scope !== 'COMPILE') {
                                                    <span class="ml-2 px-1.5 py-0.5 text-xs bg-blue-500/10 text-blue-400 rounded">{{ sl.scope }}</span>
                                                }
                                                @if (sl.isDevDependency) {
                                                    <span class="ml-2 px-1.5 py-0.5 text-xs bg-yellow-500/10 text-yellow-400 rounded">DEV</span>
                                                }
                                            </div>
                                        </div>
                                        <button
                                            (click)="onRemoveLibrary(sl)"
                                            class="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                            title="Remove"
                                        >
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                            </svg>
                                        </button>
                                    </div>
                                }
                            </div>
                        }
                    </div>

                    <!-- Add New Dependency -->
                    <div class="border-t border-[rgb(var(--color-border-base))] pt-4">
                        <h3 class="text-sm font-medium text-[rgb(var(--color-text-muted))] mb-3">Add Library Dependency</h3>
                        <div class="grid grid-cols-12 gap-3">
                            <!-- Library Select -->
                            <div class="col-span-5">
                                <select
                                    [(ngModel)]="newLibraryId"
                                    class="w-full px-3 py-2 bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-base))] rounded-md text-[rgb(var(--color-text-base))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]"
                                >
                                    <option [ngValue]="null">Select library...</option>
                                    @for (lib of availableLibraries(); track lib.id) {
                                        <option [ngValue]="lib.id">{{ lib.name }}</option>
                                    }
                                </select>
                            </div>
                            <!-- Version -->
                            <div class="col-span-2">
                                <input
                                    [(ngModel)]="newVersion"
                                    type="text"
                                    placeholder="Version"
                                    class="w-full px-3 py-2 bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-base))] rounded-md text-[rgb(var(--color-text-base))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]"
                                />
                            </div>
                            <!-- Scope -->
                            <div class="col-span-2">
                                <select
                                    [(ngModel)]="newScope"
                                    class="w-full px-3 py-2 bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-base))] rounded-md text-[rgb(var(--color-text-base))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]"
                                >
                                    <option value="COMPILE">Compile</option>
                                    <option value="RUNTIME">Runtime</option>
                                    <option value="TEST">Test</option>
                                    <option value="PROVIDED">Provided</option>
                                    <option value="OPTIONAL">Optional</option>
                                </select>
                            </div>
                            <!-- Dev checkbox -->
                            <div class="col-span-1 flex items-center">
                                <label class="flex items-center gap-1 text-xs text-[rgb(var(--color-text-muted))]">
                                    <input type="checkbox" [(ngModel)]="newIsDevDependency" class="rounded" />
                                    Dev
                                </label>
                            </div>
                            <!-- Add button -->
                            <div class="col-span-2">
                                <button
                                    (click)="onAddLibrary()"
                                    [disabled]="!newLibraryId || !newVersion || adding()"
                                    class="w-full px-3 py-2 text-sm font-medium bg-[rgb(var(--color-accent-ring))] text-white rounded-md hover:bg-[rgb(var(--color-accent-ring))]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {{ adding() ? '...' : 'Add' }}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div class="flex justify-end p-4 border-t border-[rgb(var(--color-border-base))]">
                    <button
                        (click)="onClose()"
                        class="px-4 py-2 text-sm font-medium bg-[rgb(var(--color-surface-hover))] text-[rgb(var(--color-text-base))] rounded-md hover:bg-[rgb(var(--color-surface-hover))]/80 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    `
})
export class ServiceLibrariesDialogComponent implements OnInit {
    private platformService = inject(PlatformManagementService);

    // Inputs
    service = input.required<ServiceInstance>();
    baseUrl = input.required<string>();

    // Outputs
    closed = output<void>();

    // State
    serviceLibraries = signal<ServiceLibrary[]>([]);
    allLibraries = signal<Library[]>([]);
    adding = signal(false);

    // Form state
    newLibraryId: number | null = null;
    newVersion = '';
    newScope: DependencyScope = 'COMPILE';
    newIsDevDependency = false;

    // Filter out already added libraries
    availableLibraries = () => {
        const usedIds = new Set(this.serviceLibraries().map(sl => sl.libraryId));
        return this.allLibraries().filter(lib => !usedIds.has(lib.id));
    };

    async ngOnInit() {
        await this.loadData();
    }

    private async loadData() {
        try {
            const svc = this.service();
            const [libs, svcLibs] = await Promise.all([
                this.platformService.getLibraries(this.baseUrl()),
                this.platformService.getServiceLibraries(this.baseUrl(), Number(svc.id))
            ]);
            this.allLibraries.set(libs);
            this.serviceLibraries.set(svcLibs);
        } catch (e) {
            console.error('Failed to load data', e);
        }
    }

    async onAddLibrary() {
        if (!this.newLibraryId || !this.newVersion) return;

        this.adding.set(true);
        try {
            const payload: ServiceLibraryPayload = {
                serviceId: Number(this.service().id),
                libraryId: this.newLibraryId,
                version: this.newVersion,
                scope: this.newScope,
                isDevDependency: this.newIsDevDependency,
                isDirect: true
            };

            await this.platformService.addServiceLibrary(this.baseUrl(), payload);

            // Reset form
            this.newLibraryId = null;
            this.newVersion = '';
            this.newScope = 'COMPILE';
            this.newIsDevDependency = false;

            // Reload
            await this.loadData();
        } catch (e) {
            console.error('Failed to add library', e);
        } finally {
            this.adding.set(false);
        }
    }

    async onRemoveLibrary(sl: ServiceLibrary) {
        if (!confirm(`Remove ${sl.library?.name} from dependencies?`)) return;

        try {
            await this.platformService.removeServiceLibrary(this.baseUrl(), sl.id);
            await this.loadData();
        } catch (e) {
            console.error('Failed to remove library', e);
        }
    }

    onClose() {
        this.closed.emit();
    }
}
