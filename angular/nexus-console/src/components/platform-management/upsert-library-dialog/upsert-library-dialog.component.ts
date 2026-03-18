import { ChangeDetectionStrategy, Component, inject, input, output, signal, computed, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PlatformManagementService, LibraryPayload, LookupItem } from '../../../services/platform-management.service.js';
import { Library } from '../../../models/service-mesh.model.js';

@Component({
    selector: 'app-upsert-library-dialog',
    imports: [CommonModule, ReactiveFormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" (click)="onCancel()" (window:keydown.escape)="onCancel()">
            <div class="bg-[rgb(var(--color-surface-dialog))] rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
                <!-- Header -->
                <div class="flex items-center justify-between p-4 border-b border-[rgb(var(--color-border-base))]">
                    <h2 class="text-lg font-semibold text-[rgb(var(--color-text-base))]">
                        {{ library() ? 'Edit Library' : 'Add Library' }}
                    </h2>
                    <button
                        (click)="onCancel()"
                        class="text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-base))] transition-colors"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <!-- Form -->
                <form [formGroup]="form" (ngSubmit)="onSubmit()" class="p-4 space-y-4">
                    <!-- Name -->
                    <div>
                        <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))] mb-1">Name *</label>
                        <input
                            formControlName="name"
                            type="text"
                            class="w-full px-3 py-2 bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-base))] rounded-md text-[rgb(var(--color-text-base))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]"
                            placeholder="e.g., Three.js"
                        />
                    </div>

                    <!-- Description -->
                    <div>
                        <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))] mb-1">Description</label>
                        <textarea
                            formControlName="description"
                            rows="2"
                            class="w-full px-3 py-2 bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-base))] rounded-md text-[rgb(var(--color-text-base))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]"
                            placeholder="Library description..."
                        ></textarea>
                    </div>

                    <!-- Category & Language Row -->
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))] mb-1">Category</label>
                            <select
                                formControlName="categoryId"
                                class="w-full px-3 py-2 bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-base))] rounded-md text-[rgb(var(--color-text-base))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]"
                            >
                                <option [ngValue]="null">Select category...</option>
                                @for (cat of categories(); track cat.id) {
                                    <option [ngValue]="cat.id">{{ cat.name }}</option>
                                }
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))] mb-1">Language</label>
                            <select
                                formControlName="languageId"
                                class="w-full px-3 py-2 bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-base))] rounded-md text-[rgb(var(--color-text-base))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]"
                            >
                                <option [ngValue]="null">Select language...</option>
                                @for (lang of languages(); track lang.id) {
                                    <option [ngValue]="lang.id">{{ lang.name }}</option>
                                }
                            </select>
                        </div>
                    </div>

                    <!-- Package Info Row -->
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))] mb-1">Package Name</label>
                            <input
                                formControlName="packageName"
                                type="text"
                                class="w-full px-3 py-2 bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-base))] rounded-md text-[rgb(var(--color-text-base))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]"
                                placeholder="e.g., three"
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))] mb-1">Package Manager</label>
                            <select
                                formControlName="packageManager"
                                class="w-full px-3 py-2 bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-base))] rounded-md text-[rgb(var(--color-text-base))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]"
                            >
                                <option value="">Select...</option>
                                <option value="npm">npm</option>
                                <option value="maven">Maven</option>
                                <option value="pip">pip</option>
                                <option value="cargo">Cargo</option>
                                <option value="nuget">NuGet</option>
                                <option value="go">Go Modules</option>
                            </select>
                        </div>
                    </div>

                    <!-- Version & License Row -->
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))] mb-1">Current Version</label>
                            <input
                                formControlName="currentVersion"
                                type="text"
                                class="w-full px-3 py-2 bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-base))] rounded-md text-[rgb(var(--color-text-base))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]"
                                placeholder="e.g., 0.161.0"
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))] mb-1">License</label>
                            <input
                                formControlName="license"
                                type="text"
                                class="w-full px-3 py-2 bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-base))] rounded-md text-[rgb(var(--color-text-base))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]"
                                placeholder="e.g., MIT"
                            />
                        </div>
                    </div>

                    <!-- URLs -->
                    <div>
                        <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))] mb-1">Homepage URL</label>
                        <input
                            formControlName="url"
                            type="url"
                            class="w-full px-3 py-2 bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-base))] rounded-md text-[rgb(var(--color-text-base))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]"
                            placeholder="https://..."
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))] mb-1">Repository URL</label>
                        <input
                            formControlName="repositoryUrl"
                            type="url"
                            class="w-full px-3 py-2 bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-base))] rounded-md text-[rgb(var(--color-text-base))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]"
                            placeholder="https://github.com/..."
                        />
                    </div>

                    <!-- Actions -->
                    <div class="flex justify-end gap-3 pt-4 border-t border-[rgb(var(--color-border-base))]">
                        <button
                            type="button"
                            (click)="onCancel()"
                            class="px-4 py-2 text-sm font-medium text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-base))] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            [disabled]="!form.valid || saving()"
                            class="px-4 py-2 text-sm font-medium bg-[rgb(var(--color-accent-ring))] text-white rounded-md hover:bg-[rgb(var(--color-accent-ring))]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {{ saving() ? 'Saving...' : (library() ? 'Update' : 'Create') }}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `
})
export class UpsertLibraryDialogComponent implements OnInit {
    private fb = inject(FormBuilder);
    private platformService = inject(PlatformManagementService);

    // Inputs
    library = input<Library | null>(null);
    baseUrl = input.required<string>();

    // Outputs
    saved = output<Library>();
    cancelled = output<void>();

    // State
    saving = signal(false);
    categories = signal<LookupItem[]>([]);
    languages = signal<LookupItem[]>([]);

    form: FormGroup = this.fb.group({
        name: ['', Validators.required],
        description: [''],
        categoryId: [null],
        languageId: [null],
        packageName: [''],
        packageManager: [''],
        currentVersion: [''],
        license: [''],
        url: [''],
        repositoryUrl: ['']
    });

    constructor() {
        // React to library input changes
        effect(() => {
            const lib = this.library();
            if (lib) {
                this.form.patchValue({
                    name: lib.name,
                    description: lib.description || '',
                    categoryId: lib.category?.id || null,
                    languageId: lib.language?.id || null,
                    packageName: lib.packageName || '',
                    packageManager: lib.packageManager || '',
                    currentVersion: lib.currentVersion || '',
                    license: lib.license || '',
                    url: lib.url || '',
                    repositoryUrl: lib.repositoryUrl || ''
                });
            } else {
                this.form.reset();
            }
        });
    }

    async ngOnInit() {
        await this.loadLookups();
    }

    private async loadLookups() {
        try {
            const [cats, langs] = await Promise.all([
                this.platformService.getLookup(this.baseUrl(), 'library-categories'),
                this.platformService.getLookup(this.baseUrl(), 'framework-languages')
            ]);
            this.categories.set(cats);
            this.languages.set(langs);
        } catch (e) {
            console.error('Failed to load lookups', e);
        }
    }

    async onSubmit() {
        if (!this.form.valid) return;

        this.saving.set(true);
        try {
            const payload: LibraryPayload = {
                name: this.form.value.name,
                description: this.form.value.description || undefined,
                categoryId: this.form.value.categoryId || undefined,
                languageId: this.form.value.languageId || undefined,
                packageName: this.form.value.packageName || undefined,
                packageManager: this.form.value.packageManager || undefined,
                currentVersion: this.form.value.currentVersion || undefined,
                license: this.form.value.license || undefined,
                url: this.form.value.url || undefined,
                repositoryUrl: this.form.value.repositoryUrl || undefined
            };

            let result: Library;
            const lib = this.library();
            if (lib) {
                result = await this.platformService.updateLibrary(this.baseUrl(), lib.id, payload);
            } else {
                result = await this.platformService.createLibrary(this.baseUrl(), payload);
            }

            this.saved.emit(result);
        } catch (e) {
            console.error('Failed to save library', e);
        } finally {
            this.saving.set(false);
        }
    }

    onCancel() {
        this.cancelled.emit();
    }
}
