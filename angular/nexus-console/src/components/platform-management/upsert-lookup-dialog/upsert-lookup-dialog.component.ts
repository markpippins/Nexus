import { Component, ChangeDetectionStrategy, inject, signal, input, output, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { PlatformManagementService, LookupItem } from '../../../services/platform-management.service.js';
import { ComponentRegistryService } from '../../../services/component-registry.service.js';

@Component({
    selector: 'app-upsert-lookup-dialog',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" *ngIf="isOpen()" (window:keydown.escape)="onCancel()">
       <div class="bg-[rgb(var(--color-surface))] border border-[rgb(var(--color-border-base))] shadow-2xl rounded-xl w-full max-w-md flex flex-col overflow-hidden">
          <div class="px-5 py-3.5 border-b border-[rgb(var(--color-border-base))] flex justify-between items-center">
            <h2 class="text-base font-semibold text-[rgb(var(--color-text-prominent))] capitalize">
              {{ item() ? 'Edit' : 'Add' }} {{ displayType() }}
            </h2>
            <button (click)="onCancel()" class="p-1 rounded-md text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] transition-colors">
              <span class="material-icons">close</span>
            </button>
          </div>
          
          <div class="px-5 py-4">
             <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-3.5">
                 <!-- Name -->
                 <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Name *</label>
                    <input type="text" formControlName="name" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="Name">
                    <span class="text-sm text-red-400" *ngIf="form.get('name')?.invalid && form.get('name')?.touched">Name is required</span>
                 </div>

                 <!-- Description -->
                 <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Description</label>
                    <textarea formControlName="description" rows="3" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="Description"></textarea>
                 </div>

                 <!-- URL (Vendors, Languages) -->
                 <div class="flex flex-col gap-1.5" *ngIf="isVendorOrLanguage()">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">URL</label>
                    <input type="url" formControlName="url" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="https://...">
                 </div>

                 <!-- Versioning (Languages) -->
                 <div class="flex gap-4" *ngIf="isLanguage()">
                     <div class="flex flex-col gap-1 flex-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Current Version</label>
                        <input type="text" formControlName="currentVersion" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="e.g. 21">
                     </div>
                     <div class="flex flex-col gap-1 flex-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">LTS Version</label>
                        <input type="text" formControlName="ltsVersion" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="e.g. 21">
                     </div>
                 </div>

                 <!-- Active Flag -->
                 <div class="flex items-center gap-2 mt-2">
                    <input type="checkbox" formControlName="activeFlag" id="activeFlag" class="rounded border-[rgb(var(--color-border-muted))] text-[rgb(var(--color-accent-ring))] focus:ring-[rgb(var(--color-accent-ring))]">
                    <label for="activeFlag" class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Active</label>
                 </div>

                 <!-- Default Visual Component (Service Types only) -->
                 <div class="flex flex-col gap-1.5" *ngIf="isServiceType()">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Default Visual Style</label>
                    <select formControlName="defaultComponentId" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors">
                        <option [ngValue]="null">-- None --</option>
                        <option *ngFor="let comp of registry.allComponents()" [ngValue]="comp.id">
                            {{ comp.name }} ({{ comp.geometry }})
                        </option>
                    </select>
                 </div>
             </form>
          </div>

          <div class="px-5 py-3.5 border-t border-[rgb(var(--color-border-base))] flex justify-end gap-2.5 bg-[rgb(var(--color-surface-muted))]">
             <button type="button" (click)="onCancel()" class="px-3.5 py-1.5 text-sm font-medium rounded-md text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))] transition-colors">Cancel</button>
             <button type="button" (click)="onSubmit()" [disabled]="form.invalid || isSaving()" class="px-4 py-1.5 text-sm font-semibold rounded-md bg-[rgb(var(--color-accent-ring))] text-white hover:bg-[rgb(var(--color-accent-ring))]/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors">
                <span *ngIf="isSaving()" class="material-icons text-sm animate-spin">refresh</span>
                Save
             </button>
          </div>
       </div>
    </div>
  `
})
export class UpsertLookupDialogComponent {
    private fb = inject(FormBuilder);
    private platformService = inject(PlatformManagementService);
    public registry = inject(ComponentRegistryService);

    isOpen = input.required<boolean>();
    baseUrl = input.required<string>();
    type = input.required<string>();
    item = input<LookupItem | null>(null);

    close = output<void>();
    saved = output<LookupItem>();

    form: FormGroup;
    isSaving = signal(false);

    displayType = computed(() => this.type().toLowerCase().replace(/-/g, ' '));
    isServiceType = computed(() => this.type() === 'service-types');
    isVendorOrLanguage = computed(() => this.type() === 'framework-vendors' || this.type() === 'framework-languages');
    isLanguage = computed(() => this.type() === 'framework-languages');

    constructor() {
        this.form = this.fb.group({
            name: ['', Validators.required],
            description: [''],
            activeFlag: [true],
            url: [''],
            currentVersion: [''],
            ltsVersion: [''],
            defaultComponentId: [null]
        });

        effect(() => {
            if (this.isOpen()) {
                // Attempt to refresh backend visual components so the
                // dropdown shows real numeric IDs instead of fallback strings.
                if (this.isServiceType() && !this.registry.backendLoaded()) {
                    this.registry.refresh();
                }

                const i = this.item();
                if (i) {
                    // Guard: if defaultComponentId is a non-numeric string (e.g.
                    // from INITIAL_REGISTRY fallback), treat it as null to avoid
                    // sending an invalid ID to the backend.
                    //
                    // The list GET response includes `defaultComponent: { id: N }`
                    // but NOT `defaultComponentId` (that field is @Transient on the
                    // backend).  Fall back to `defaultComponent.id` when present.
                    const rawId: unknown =
                        i.defaultComponentId ?? (i.defaultComponent as any)?.id;
                    const safeId: number | null =
                        rawId === null || rawId === undefined ? null :
                        typeof rawId === 'number' ? rawId :
                        typeof rawId === 'string' && /^\d+$/.test(rawId) ? Number(rawId) :
                        null;
                    this.form.patchValue({
                        name: i.name,
                        description: i.description,
                        activeFlag: i.activeFlag !== false, // default true
                        url: '', // url field not on LookupItem interface
                        currentVersion: i.version || '',
                        ltsVersion: i.ltsFlag ? i.version || '' : '',
                        defaultComponentId: safeId
                    });
                } else {
                    this.form.reset({ defaultComponentId: null, activeFlag: true });
                }
            }
        });
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
        const type = this.type();

        // Build payload based on form values, mapping to LookupItem interface
        const formValue = this.form.value;
        // Guard: defaultComponentId must be numeric (backend expects Long).
        // The INITIAL_REGISTRY fallback uses string IDs like 'sys-cache' which
        // the backend rejects with 400. Coerce non-numeric non-null values to null.
        const rawComponentId: unknown = formValue.defaultComponentId;
        const safeComponentId: number | null =
            rawComponentId === null || rawComponentId === undefined ? null :
            typeof rawComponentId === 'number' ? rawComponentId :
            typeof rawComponentId === 'string' && /^\d+$/.test(rawComponentId) ? Number(rawComponentId) :
            null;
        const payload: Partial<LookupItem> = {
            name: formValue.name,
            description: formValue.description,
            activeFlag: formValue.activeFlag,
            defaultComponentId: safeComponentId,
            // Map version fields to LookupItem structure
            version: formValue.currentVersion || undefined,
            ltsFlag: formValue.ltsVersion ? true : undefined,
        };

        try {
            let result: LookupItem;
            const currentItem = this.item();

            if (currentItem) {
                // Update
                result = await this.platformService.updateLookup(url, type, currentItem.id, payload);
            } else {
                // Create
                result = await this.platformService.createLookup(url, type, payload);
            }
            this.saved.emit(result);
            this.close.emit();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const stack = e instanceof Error ? e.stack : '';
            console.error(`Failed to save ${type}:`, { message: msg, stack, url, type, payload: JSON.stringify(payload) });
            alert(`Failed to save ${type}\n\n${msg}`);
        } finally {
            this.isSaving.set(false);
        }
    }
}
