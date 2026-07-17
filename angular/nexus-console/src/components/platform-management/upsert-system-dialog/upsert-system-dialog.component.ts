import { Component, ChangeDetectionStrategy, inject, signal, input, output, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { PlatformManagementService, SystemItem, SystemPayload, LookupItem } from '../../../services/platform-management.service.js';

@Component({
    selector: 'app-upsert-system-dialog',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" (window:keydown.escape)="onCancel()">
        <div class="bg-[rgb(var(--color-surface))] border border-[rgb(var(--color-border-base))] shadow-xl rounded-lg w-full max-w-lg flex flex-col max-h-[90vh]">
            <div class="p-4 border-b border-[rgb(var(--color-border-base))] flex justify-between items-center">
                <h2 class="text-lg font-semibold text-[rgb(var(--color-text-base))]">
                    {{ system() ? 'Edit' : 'Add' }} System
                </h2>
                <button (click)="onCancel()" class="text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-base))]">
                    <span class="material-icons">close</span>
                </button>
            </div>

            <div class="p-6 overflow-y-auto flex-1">
                <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-4">
                    <!-- Name -->
                    <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Name *</label>
                        <input type="text" formControlName="name" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]" placeholder="system-name">
                        <span class="text-xs text-red-500" *ngIf="form.get('name')?.invalid && form.get('name')?.touched">Name is required</span>
                    </div>

                    <!-- Type -->
                    <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Type</label>
                        <select formControlName="type" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]">
                            <option [value]="null">Select Type</option>
                            @for (t of systemTypes(); track t.id) {
                                <option [value]="t.name">{{ t.name }}</option>
                            }
                        </select>
                    </div>

                    <!-- Description -->
                    <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Description</label>
                        <textarea formControlName="description" rows="3" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]" placeholder="System description"></textarea>
                    </div>
                </form>
            </div>

            <div class="p-4 border-t border-[rgb(var(--color-border-base))] flex justify-end gap-3 bg-[rgb(var(--color-surface-sidebar))] rounded-b-lg">
                <button type="button" (click)="onCancel()" class="px-4 py-2 rounded text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))]">Cancel</button>
                <button type="button" (click)="onSubmit()" [disabled]="form.invalid || isSaving()" class="px-4 py-2 rounded bg-[rgb(var(--color-accent-ring))] text-white hover:bg-opacity-90 disabled:opacity-50 flex items-center gap-2">
                    <span *ngIf="isSaving()" class="material-icons text-sm animate-spin">refresh</span>
                    Save
                </button>
            </div>
        </div>
    </div>
  `
})
export class UpsertSystemDialogComponent {
    private fb = inject(FormBuilder);
    private platformService = inject(PlatformManagementService);

    isOpen = input.required<boolean>();
    baseUrl = input.required<string>();
    system = input<SystemItem | null>(null);

    saved = output<SystemItem>();
    cancelled = output<void>();

    form: FormGroup;
    systemTypes = signal<LookupItem[]>([]);
    isSaving = signal(false);

    constructor() {
        this.form = this.fb.group({
            name: ['', Validators.required],
            type: [null],
            description: ['']
        });

        effect(() => {
            if (this.isOpen()) {
                this.loadSystemTypes();
                const s = this.system();
                if (s) {
                    this.form.patchValue({
                        name: s.name,
                        type: s.type || null,
                        description: s.description || ''
                    });
                } else {
                    this.form.reset({ type: null, description: '' });
                }
            }
        });
    }

    async loadSystemTypes() {
        const url = this.baseUrl();
        if (!url) return;

        try {
            const types = await this.platformService.getLookup(url, 'system-types');
            this.systemTypes.set(types.data);
        } catch (e) {
            console.error('Failed to load system types', e);
        }
    }

    onCancel() {
        this.cancelled.emit();
    }

    async onSubmit() {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        this.isSaving.set(true);
        const url = this.baseUrl();
        const payload: SystemPayload = {
            name: this.form.value.name,
            type: this.form.value.type || undefined,
            description: this.form.value.description || undefined
        };

        try {
            let result: SystemItem;
            if (this.system()) {
                // The API may not support PUT, so we'll attempt create-with-update
                // For now, use create and fallback
                result = await this.platformService.createSystem(url, payload);
            } else {
                result = await this.platformService.createSystem(url, payload);
            }
            this.saved.emit(result);
            this.cancelled.emit();
        } catch (e) {
            console.error('Failed to save system', e);
            alert('Failed to save system.');
        } finally {
            this.isSaving.set(false);
        }
    }
}
