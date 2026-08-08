import { Component, ChangeDetectionStrategy, inject, signal, input, output, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { PlatformManagementService, LookupItem, ServicePayload, SystemItem, LOOKUP_SERVICE_TYPES } from '../../../services/platform-management.service.js';
import { Framework, ServiceInstance } from '../../../models/service-mesh.model.js';
import { ComponentRegistryService } from '../../../services/component-registry.service.js';

@Component({
    selector: 'app-upsert-service-dialog',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" *ngIf="isOpen()" (window:keydown.escape)="onCancel()">
       <div class="bg-[rgb(var(--color-surface))] border border-[rgb(var(--color-border-base))] shadow-2xl rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
          <div class="px-5 py-3.5 border-b border-[rgb(var(--color-border-base))] flex justify-between items-center">
            <h2 class="text-base font-semibold text-[rgb(var(--color-text-prominent))]">
              {{ service() ? 'Edit' : 'Add' }} Service
            </h2>
            <button (click)="onCancel()" class="p-1 rounded-md text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] transition-colors">
              <span class="material-icons">close</span>
            </button>
          </div>
          
          <div class="px-5 py-4 overflow-y-auto flex-1">
             <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-3.5">
                 <!-- Name -->
                 <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Name *</label>
                    <input type="text" formControlName="name" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="service-name">
                    <span class="text-sm text-red-400" *ngIf="form.get('name')?.invalid && form.get('name')?.touched">Name is required</span>
                 </div>

                 <!-- Description -->
                 <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Description</label>
                    <textarea formControlName="description" rows="3" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="Service description"></textarea>
                 </div>

                 <div class="grid grid-cols-2 gap-4">
                     <!-- Framework -->
                     <div class="flex flex-col gap-1.5">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Framework *</label>
                        <select formControlName="frameworkId" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors">
                            <option [value]="null">Select Framework</option>
                            <option *ngFor="let f of frameworks()" [value]="f.id">{{ f.name }}</option>
                        </select>
                     </div>

                     <!-- Service Type -->
                     <div class="flex flex-col gap-1.5">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Service Type *</label>
                         <select formControlName="serviceTypeId" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors">
                            <option [value]="null">Select Type</option>
                            <option *ngFor="let t of serviceTypes()" [value]="t.id">{{ t.name }}</option>
                        </select>
                     </div>
                 </div>

                 <!-- Parent Service (for sub-modules) -->
                 <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Parent Service (Optional)</label>
                    <select formControlName="parentServiceId" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors">
                        <option [value]="null">-- Standalone Service --</option>
                        <option *ngFor="let p of parentServices()" [value]="p.id">{{ p.name }}</option>
                    </select>
                    <span class="text-sm text-[rgb(var(--color-text-muted))]">Select a parent service to mark this as a sub-module</span>
                 </div>

                 <!-- Visual Override -->
                 <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Visual Style Override</label>
                    <select formControlName="componentOverrideId" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors">
                        <option [value]="null">-- Default (Use Service Type) --</option>
                        <option *ngFor="let comp of registry.allComponents()" [value]="comp.id">
                            {{ comp.name }} ({{ comp.geometry }})
                        </option>
                    </select>
                 </div>

                 <div class="grid grid-cols-2 gap-4">
                     <!-- Default Port -->
                     <div class="flex flex-col gap-1.5">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Default Port</label>
                        <input type="number" formControlName="defaultPort" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="8081">
                     </div>

                     <!-- Status -->
                     <div class="flex flex-col gap-1.5">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Status</label>
                        <select formControlName="status" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors">
                            <option value="ACTIVE">Active</option>
                            <option value="DEPRECATED">Deprecated</option>
                            <option value="ARCHIVED">Archived</option>
                            <option value="PLANNED">Planned</option>
                        </select>
                     </div>
                 </div>

                 <!-- API Base Path -->
                 <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">API Base Path</label>
                    <input type="text" formControlName="apiBasePath" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="/api/v1/resource">
                 </div>

                 <!-- Repository URL -->
                 <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Repository URL</label>
                    <input type="text" formControlName="repositoryUrl" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="https://github.com/...">
                 </div>

                 <!-- System -->
                 <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">System</label>
                    <select formControlName="systemId" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors">
                        <option [value]="null">-- No System --</option>
                        @for (sys of systems(); track sys.id) {
                            <option [value]="sys.name">{{ sys.name }}</option>
                        }
                    </select>
                    <span class="text-sm text-[rgb(var(--color-text-muted))]">Assign this service to a domain system</span>
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
    systems = signal<SystemItem[]>([]);
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
            componentOverrideId: [null],
            systemId: [null]
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

        // Load each lookup independently so one failure doesn't empty all three
        try {
            const fw = await this.platformService.getFrameworks(url);
            this.frameworks.set(fw.data);
        } catch (e) {
            console.error('Failed to load frameworks', e);
        }
        try {
            const types = await this.platformService.getLookup(url, LOOKUP_SERVICE_TYPES);
            this.serviceTypes.set(types.data);
        } catch (e) {
            console.error('Failed to load service types', e);
        }
        try {
            const allServices = await this.platformService.getServices(url);
            // Show all services as potential parents, excluding self when editing
            const currentId = this.service()?.id;
            this.parentServices.set(
                allServices.data.filter(s => String(s.id) !== String(currentId))
            );
        } catch (e) {
            console.error('Failed to load services for parent dropdown', e);
        }
        try {
            const sysResp = await this.platformService.getSystems(url);
            this.systems.set(sysResp.data);
        } catch (e) {
            console.error('Failed to load systems', e);
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
        const systemName: string | undefined = payload.systemId;
        delete payload.systemId;

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

            // Associate the service with the selected system via the domain systems API
            if (systemName && result.name) {
                await this.platformService.associateServiceWithSystem(url, systemName, result.name)
                    .catch(err => console.warn('Failed to associate service with system', err));
                // Non-blocking — the service was still created/updated
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
