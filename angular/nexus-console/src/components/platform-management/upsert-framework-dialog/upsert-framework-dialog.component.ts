import { Component, ChangeDetectionStrategy, inject, signal, input, output, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { PlatformManagementService, LookupItem, FrameworkPayload } from '../../../services/platform-management.service.js';
import { Framework } from '../../../models/service-mesh.model.js';

@Component({
    selector: 'app-upsert-framework-dialog',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" *ngIf="isOpen()" (window:keydown.escape)="onCancel()">
       <div class="bg-[rgb(var(--color-surface))] border border-[rgb(var(--color-border-base))] shadow-xl rounded-lg w-full max-w-2xl flex flex-col max-h-[90vh]">
          <div class="p-4 border-b border-[rgb(var(--color-border-base))] flex justify-between items-center">
            <h2 class="text-lg font-semibold text-[rgb(var(--color-text-base))]">
              {{ framework() ? 'Edit' : 'Add' }} Framework
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
                    <input type="text" formControlName="name" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]" placeholder="Framework Name">
                    <span class="text-xs text-red-500" *ngIf="form.get('name')?.invalid && form.get('name')?.touched">Name is required</span>
                 </div>

                 <!-- Description -->
                 <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Description</label>
                    <textarea formControlName="description" rows="3" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]" placeholder="Framework description"></textarea>
                 </div>

                 <div class="grid grid-cols-2 gap-4">
                     <!-- Category -->
                     <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Category *</label>
                        <select formControlName="categoryId" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]">
                            <option [value]="null">Select Category</option>
                            <option *ngFor="let c of categories()" [value]="c.id">{{ c.name }}</option>
                        </select>
                     </div>

                     <!-- Language -->
                     <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Language *</label>
                         <select formControlName="languageId" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]">
                            <option [value]="null">Select Language</option>
                            <option *ngFor="let l of languages()" [value]="l.id">{{ l.name }}</option>
                        </select>
                     </div>
                 </div>

                 <div class="grid grid-cols-2 gap-4">
                     <!-- Current Version -->
                     <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Current Version</label>
                        <input type="text" formControlName="currentVersion" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]" placeholder="v1.0.0">
                     </div>

                     <!-- LTS Version -->
                     <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">LTS Version</label>
                        <input type="text" formControlName="ltsVersion" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]" placeholder="v1.0.0">
                     </div>
                 </div>

                 <!-- URL -->
                 <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">URL</label>
                    <input type="text" formControlName="url" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]" placeholder="https://framework.com">
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
export class UpsertFrameworkDialogComponent implements OnInit {
    private fb = inject(FormBuilder);
    private platformService = inject(PlatformManagementService);

    isOpen = input.required<boolean>();
    baseUrl = input.required<string>();
    framework = input<Framework | null>(null);

    close = output<void>();
    saved = output<Framework>();

    form: FormGroup;
    categories = signal<LookupItem[]>([]);
    languages = signal<LookupItem[]>([]);
    isSaving = signal(false);

    constructor() {
        this.form = this.fb.group({
            name: ['', Validators.required],
            description: [''],
            categoryId: [null, Validators.required],
            languageId: [null, Validators.required],
            vendorId: [1, Validators.required], // Hardcoded default
            currentVersion: [''],
            ltsVersion: [''],
            url: ['']
        });

        // Effect to patch values when framework changes or dialog opens
        effect(() => {
            if (this.isOpen()) {
                this.loadOptions();
                const f = this.framework();
                if (f) {
                    this.form.patchValue({
                        name: f.name,
                        description: f.description,
                        categoryId: f.category?.id,
                        languageId: f.language?.id,
                        vendorId: 1, // Default or f.vendorId
                        currentVersion: f.currentVersion,
                        ltsVersion: f.ltsVersion,
                        url: f.url
                    });
                } else {
                    this.form.reset({
                        vendorId: 1
                    });
                }
            }
        });
    }

    ngOnInit() {
        // Initial load?
    }

    async loadOptions() {
        const url = this.baseUrl();
        if (!url) return;

        try {
            const [cats, langs] = await Promise.all([
                this.platformService.getLookup(url, 'framework-categories'),
                this.platformService.getLookup(url, 'framework-languages')
            ]);
            this.categories.set(cats);
            this.languages.set(langs);
        } catch (e) {
            console.error('Failed to load options', e);
        }
    }

    onCancel() {
        this.close.emit();
    }

    async onSubmit() {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        this.isSaving.set(true);
        const url = this.baseUrl();
        const payload: FrameworkPayload = this.form.value;

        // Ensure numbers are numbers
        payload.categoryId = Number(payload.categoryId);
        payload.languageId = Number(payload.languageId);
        payload.vendorId = Number(payload.vendorId);

        try {
            let result: Framework;
            const currentFramework = this.framework();

            if (currentFramework) {
                // Update
                result = await this.platformService.updateFramework(url, Number(currentFramework.id), payload);
            } else {
                // Create
                result = await this.platformService.createFramework(url, payload);
            }
            this.saved.emit(result);
            this.close.emit();
        } catch (e) {
            console.error('Failed to save framework', e);
            alert('Failed to save framework.');
        } finally {
            this.isSaving.set(false);
        }
    }
}
