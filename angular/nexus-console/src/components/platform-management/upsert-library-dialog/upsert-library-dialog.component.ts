import { ChangeDetectionStrategy, Component, inject, input, output, signal, computed, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PlatformManagementService, LibraryPayload, LookupItem, LOOKUP_LIBRARY_CATEGORIES, LOOKUP_FRAMEWORK_LANGUAGES } from '../../../services/platform-management.service.js';
import { Library } from '../../../models/service-mesh.model.js';

@Component({
    selector: 'app-upsert-library-dialog',
    imports: [CommonModule, ReactiveFormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" (click)="onCancel()" (window:keydown.escape)="onCancel()">
            <div class="bg-[rgb(var(--color-surface))] border border-[rgb(var(--color-border-base))] shadow-2xl rounded-xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden" (click)="$event.stopPropagation()">
                <!-- Header -->
                <div class="px-5 py-3.5 border-b border-[rgb(var(--color-border-base))] flex justify-between items-center">
                    <h2 class="text-base font-semibold text-[rgb(var(--color-text-prominent))]">
                        {{ library() ? 'Edit Library' : 'Add Library' }}
                    </h2>
                    <button
                        (click)="onCancel()"
                        class="p-1 rounded-md text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] transition-colors"
                    >
                        <span class="material-icons">close</span>
                    </button>
                </div>

                <!-- Body -->
                <div class="px-5 py-4 overflow-y-auto flex-1">
                    <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-3.5">
                        <!-- Name -->
                        <div class="flex flex-col gap-1.5">
                            <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Name *</label>
                            <input
                                formControlName="name"
                                type="text"
                                class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors"
                                placeholder="e.g., Three.js"
                            />
                        </div>

                        <!-- Description -->
                        <div class="flex flex-col gap-1.5">
                            <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Description</label>
                            <textarea
                                formControlName="description"
                                rows="2"
                                class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors"
                                placeholder="Library description..."
                            ></textarea>
                        </div>

                        <!-- Category & Language Row -->
                        <div class="grid grid-cols-2 gap-4">
                            <div class="flex flex-col gap-1.5">
                                <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Category</label>
                                <select
                                    formControlName="categoryId"
                                    class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors"
                                >
                                    <option [ngValue]="null">Select category...</option>
                                    @for (cat of categories(); track cat.id) {
                                        <option [ngValue]="cat.id">{{ cat.name }}</option>
                                    }
                                </select>
                            </div>
                            <div class="flex flex-col gap-1.5">
                                <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Language</label>
                                <select
                                    formControlName="languageId"
                                    class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors"
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
                            <div class="flex flex-col gap-1.5">
                                <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Package Name</label>
                                <input
                                    formControlName="packageName"
                                    type="text"
                                    class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors"
                                    placeholder="e.g., three"
                                />
                            </div>
                            <div class="flex flex-col gap-1.5">
                                <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Package Manager</label>
                                <select
                                    formControlName="packageManager"
                                    class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors"
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
                            <div class="flex flex-col gap-1.5">
                                <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Current Version</label>
                                <input
                                    formControlName="currentVersion"
                                    type="text"
                                    class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors"
                                    placeholder="e.g., 0.161.0"
                                />
                            </div>
                            <div class="flex flex-col gap-1.5">
                                <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">License</label>
                                <input
                                    formControlName="license"
                                    type="text"
                                    class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors"
                                    placeholder="e.g., MIT"
                                />
                            </div>
                        </div>

                        <!-- URLs -->
                        <div class="flex flex-col gap-1.5">
                            <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Homepage URL</label>
                            <input
                                formControlName="url"
                                type="url"
                                class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors"
                                placeholder="https://..."
                            />
                        </div>
                        <div class="flex flex-col gap-1.5">
                            <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Repository URL</label>
                            <input
                                formControlName="repositoryUrl"
                                type="url"
                                class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors"
                                placeholder="https://github.com/..."
                            />
                        </div>
                    </form>
                </div>

                <!-- Footer -->
                <div class="px-5 py-3.5 border-t border-[rgb(var(--color-border-base))] flex justify-end gap-2.5 bg-[rgb(var(--color-surface-muted))]">
                    <button
                        type="button"
                        (click)="onCancel()"
                        class="px-3.5 py-1.5 text-sm font-medium rounded-md text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))] transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        (click)="onSubmit()"
                        [disabled]="!form.valid || saving()"
                        class="px-4 py-1.5 text-sm font-semibold rounded-md bg-[rgb(var(--color-accent-ring))] text-white hover:bg-[rgb(var(--color-accent-ring))]/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    >
                        @if (saving()) {
                            <span class="material-icons text-sm animate-spin">refresh</span>
                        }
                        {{ saving() ? 'Saving...' : (library() ? 'Update' : 'Create') }}
                    </button>
                </div>
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
                this.platformService.getLookup(this.baseUrl(), LOOKUP_LIBRARY_CATEGORIES).then(r => r.data).catch(() => []),
                this.platformService.getLookup(this.baseUrl(), LOOKUP_FRAMEWORK_LANGUAGES).then(r => r.data).catch(() => [])
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
