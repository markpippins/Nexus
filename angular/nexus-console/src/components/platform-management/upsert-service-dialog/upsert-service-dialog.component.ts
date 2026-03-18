import { Component, ChangeDetectionStrategy, inject, signal, input, output, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { PlatformManagementService, LookupItem, ServicePayload } from '../../../services/platform-management.service.js';
import { Framework, ServiceInstance } from '../../../models/service-mesh.model.js';
import { ComponentRegistryService } from '../../../services/component-registry.service.js';

@Component({
    selector: 'app-upsert-service-dialog',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" *ngIf="isOpen()" (window:keydown.escape)="onCancel()">
       <div class="bg-[rgb(var(--color-surface))] border border-[rgb(var(--color-border-base))] shadow-xl rounded-lg w-full max-w-2xl flex flex-col max-h-[90vh]">
          <div class="p-4 border-b border-[rgb(var(--color-border-base))] flex justify-between items-center">
            <h2 class="text-lg font-semibold text-[rgb(var(--color-text-base))]">
              {{ service() ? 'Edit' : 'Add' }} Service
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
                    <input type="text" formControlName="name" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]" placeholder="service-name">
                    <span class="text-xs text-red-500" *ngIf="form.get('name')?.invalid && form.get('name')?.touched">Name is required</span>
                 </div>

                 <!-- Description -->
                 <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Description</label>
                    <textarea formControlName="description" rows="3" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]" placeholder="Service description"></textarea>
                 </div>

                 <div class="grid grid-cols-2 gap-4">
                     <!-- Framework -->
                     <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Framework *</label>
                        <select formControlName="frameworkId" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]">
                            <option [value]="null">Select Framework</option>
                            <option *ngFor="let f of frameworks()" [value]="f.id">{{ f.name }}</option>
                        </select>
                     </div>

                     <!-- Service Type -->
                     <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Service Type *</label>
                         <select formControlName="serviceTypeId" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]">
                            <option [value]="null">Select Type</option>
                            <option *ngFor="let t of serviceTypes()" [value]="t.id">{{ t.name }}</option>
                        </select>
                     </div>
                 </div>

                 <!-- Parent Service (for sub-modules) -->
                 <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Parent Service (Optional)</label>
                    <select formControlName="parentServiceId" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]">
                        <option [value]="null">-- Standalone Service --</option>
                        <option *ngFor="let p of parentServices()" [value]="p.id">{{ p.name }}</option>
                    </select>
                    <span class="text-xs text-[rgb(var(--color-text-muted))]">Select a parent service to mark this as a sub-module</span>
                 </div>

                 <!-- Visual Override -->
                 <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Visual Style Override</label>
                    <select formControlName="componentOverrideId" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]">
                        <option [value]="null">-- Default (Use Service Type) --</option>
                        <option *ngFor="let comp of registry.allComponents()" [value]="comp.id">
                            {{ comp.name }} ({{ comp.geometry }})
                        </option>
                    </select>
                 </div>

                 <div class="grid grid-cols-2 gap-4">
                     <!-- Default Port -->
                     <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Default Port</label>
                        <input type="number" formControlName="defaultPort" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]" placeholder="8080">
                     </div>

                     <!-- Status -->
                     <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Status</label>
                        <select formControlName="status" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]">
                            <option value="ACTIVE">Active</option>
                            <option value="DEPRECATED">Deprecated</option>
                            <option value="ARCHIVED">Archived</option>
                            <option value="PLANNED">Planned</option>
                        </select>
                     </div>
                 </div>

                 <!-- API Base Path -->
                 <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">API Base Path</label>
                    <input type="text" formControlName="apiBasePath" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]" placeholder="/api/v1/resource">
                 </div>

                 <!-- Repository URL -->
                 <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Repository URL</label>
                    <input type="text" formControlName="repositoryUrl" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]" placeholder="https://github.com/...">
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
export class UpsertServiceDialogComponent implements OnInit {
    private fb = inject(FormBuilder);
    private platformService = inject(PlatformManagementService);
    public registry = inject(ComponentRegistryService);

    isOpen = input.required<boolean>();
    baseUrl = input.required<string>();
    service = input<ServiceInstance | null>(null);

    close = output<void>();
    saved = output<ServiceInstance>();

    form: FormGroup;
    frameworks = signal<Framework[]>([]);
    serviceTypes = signal<LookupItem[]>([]);
    parentServices = signal<ServiceInstance[]>([]);
    isSaving = signal(false);

    constructor() {
        this.form = this.fb.group({
            name: ['', Validators.required],
            description: [''],
            frameworkId: [null, Validators.required],
            serviceTypeId: [null, Validators.required],
            parentServiceId: [null],
            defaultPort: [null],
            status: ['ACTIVE'],
            apiBasePath: [''],
            repositoryUrl: [''],
            componentOverrideId: [null]
        });

        // Effect to patch values when service changes or dialog opens
        effect(() => {
            if (this.isOpen()) {
                this.loadOptions();
                const s = this.service();
                if (s) {
                    this.form.patchValue({
                        name: s.name,
                        description: s.description,
                        frameworkId: s.framework?.id,
                        serviceTypeId: s.type?.id,
                        parentServiceId: s.parentServiceId || null,
                        defaultPort: s.defaultPort,
                        status: s.status as any,
                        apiBasePath: s.apiBasePath,
                        repositoryUrl: s.repositoryUrl,
                        componentOverrideId: s.componentOverrideId || null
                    });
                } else {
                    this.form.reset({
                        status: 'ACTIVE',
                        parentServiceId: null,
                        componentOverrideId: null
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
            const [fw, types, parents] = await Promise.all([
                this.platformService.getFrameworks(url),
                this.platformService.getLookup(url, 'service-types'),
                this.platformService.getStandaloneServices(url)
            ]);
            this.frameworks.set(fw);
            this.serviceTypes.set(types);
            this.parentServices.set(parents);
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
        const payload: ServicePayload = this.form.value;

        // Ensure numbers are numbers
        payload.frameworkId = Number(payload.frameworkId);
        payload.serviceTypeId = Number(payload.serviceTypeId);
        if (payload.parentServiceId) payload.parentServiceId = Number(payload.parentServiceId) || undefined;
        if (payload.defaultPort) payload.defaultPort = Number(payload.defaultPort);
        if (payload.componentOverrideId) payload.componentOverrideId = Number(payload.componentOverrideId) || undefined;
        // if null/0, it might be effectively resetting to default.
        // Backend should handle null.

        try {
            let result: ServiceInstance;
            const currentService = this.service();

            if (currentService) {
                // Update
                result = await this.platformService.updateService(url, Number(currentService.id), payload);
            } else {
                // Create
                result = await this.platformService.createService(url, payload);
            }
            this.saved.emit(result);
            this.close.emit();
        } catch (e) {
            console.error('Failed to save service', e);
            alert('Failed to save service. Check validity and uniqueness of name.');
        } finally {
            this.isSaving.set(false);
        }
    }
}
