import { Component, ChangeDetectionStrategy, inject, signal, input, output, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { PlatformManagementService, LookupItem, DeploymentPayload, Host } from '../../../services/platform-management.service.js';
import { Deployment, ServiceInstance } from '../../../models/service-mesh.model.js';

@Component({
    selector: 'app-upsert-deployment-dialog',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" *ngIf="isOpen()" (window:keydown.escape)="onCancel()">
       <div class="bg-[rgb(var(--color-surface))] border border-[rgb(var(--color-border-base))] shadow-xl rounded-lg w-full max-w-2xl flex flex-col max-h-[90vh]">
          <div class="p-4 border-b border-[rgb(var(--color-border-base))] flex justify-between items-center">
            <h2 class="text-lg font-semibold text-[rgb(var(--color-text-base))]">
              {{ deployment() ? 'Edit' : 'Add' }} Deployment
            </h2>
            <button (click)="onCancel()" class="text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-base))]">
              <span class="material-icons">close</span>
            </button>
          </div>
          
          <div class="p-6 overflow-y-auto flex-1">
             <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-4">
                 <div class="grid grid-cols-2 gap-4">
                     <!-- Service -->
                     <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Service *</label>
                        <select formControlName="serviceId" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]">
                            <option [value]="null">Select Service</option>
                            <option *ngFor="let s of standaloneServices()" [value]="s.id">{{ s.name }}</option>
                        </select>
                        <span class="text-xs text-[rgb(var(--color-text-muted))]">Sub-modules are automatically deployed with their parent service</span>
                     </div>

                     <!-- Server -->
                     <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Server *</label>
                        <select formControlName="serverId" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]">
                            <option [value]="null">Select Server</option>
                            <option *ngFor="let s of servers()" [value]="s.id">{{ s.hostname }}</option>
                        </select>
                     </div>
                 </div>

                 <div class="grid grid-cols-2 gap-4">
                     <!-- Environment -->
                     <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Environment *</label>
                        <select formControlName="environmentId" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]">
                            <option [value]="null">Select Environment</option>
                            <option *ngFor="let e of environments()" [value]="e.id">{{ e.name }}</option>
                        </select>
                     </div>

                      <!-- Status -->
                     <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Status</label>
                        <select formControlName="status" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]">
                            <option value="STOPPED">STOPPED</option>
                            <option value="RUNNING">RUNNING</option>
                            <option value="STARTING">STARTING</option>
                            <option value="FAILED">FAILED</option>
                            <option value="UNKNOWN">UNKNOWN</option>
                        </select>
                     </div>
                 </div>

                 <div class="grid grid-cols-2 gap-4">
                     <!-- Version -->
                     <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Version</label>
                        <input type="text" formControlName="version" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]" placeholder="v1.0.0">
                     </div>

                     <!-- Port -->
                     <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Port</label>
                        <input type="number" formControlName="port" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]" placeholder="8080">
                     </div>
                 </div>

                 <!-- Context API Path -->
                 <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Context Path</label>
                    <input type="text" formControlName="contextPath" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]" placeholder="/api/v1">
                 </div>

                 <!-- Health Check URL -->
                 <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-[rgb(var(--color-text-base))]">Health Check URL</label>
                    <input type="text" formControlName="healthCheckUrl" class="p-2 rounded border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] focus:border-[rgb(var(--color-accent-ring))]" placeholder="http://host:port/health">
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
export class UpsertDeploymentDialogComponent implements OnInit {
    private fb = inject(FormBuilder);
    private platformService = inject(PlatformManagementService);

    isOpen = input.required<boolean>();
    baseUrl = input.required<string>();
    deployment = input<Deployment | null>(null);

    close = output<void>();
    saved = output<Deployment>();

    form: FormGroup;
    services = signal<ServiceInstance[]>([]);
    standaloneServices = signal<ServiceInstance[]>([]);
    servers = signal<Host[]>([]);
    environments = signal<LookupItem[]>([]);
    isSaving = signal(false);

    constructor() {
        this.form = this.fb.group({
            serviceId: [null, Validators.required],
            serverId: [null, Validators.required],
            environmentId: [null, Validators.required],
            version: [''],
            status: ['STOPPED'],
            port: [null],
            contextPath: [''],
            healthCheckUrl: ['']
        });

        effect(() => {
            if (this.isOpen()) {
                this.loadOptions();
                const d = this.deployment();
                if (d) {
                    this.form.patchValue({
                        serviceId: d.service?.id,
                        serverId: d.server?.id, // Assumes d.server exists or verify
                        environmentId: null, // Need environment ID, but d.environment is ENUM. d.environmentId missing in interface?
                        version: d.version,
                        status: d.status,
                        port: d.port,
                        // contextPath, healthCheckUrl might be missing in Deployment interface?
                        // Let's check Deployment definition again.
                        healthCheckUrl: d.healthCheckUrl
                    });
                    // Note: d.environment is 'DEVELOPMENT' enum string. But form needs ID.
                    // The Deployment interface on frontend doesn't have environmentId.
                    // Backend deployment has environmentId.
                    // Frontend Deployment interface needs update if we want to edit properly?
                    // Or I can map enum string to ID if I fetch environment types.
                } else {
                    this.form.reset({
                        status: 'STOPPED'
                    });
                }
            }
        });
    }

    ngOnInit() { }

    async loadOptions() {
        const url = this.baseUrl();
        if (!url) return;

        try {
            const [srvs, hosts, envs] = await Promise.all([
                this.platformService.getServices(url),
                this.platformService.getServers(url),
                this.platformService.getLookup(url, 'environment-types')
            ]);
            this.services.set(srvs);
            // Filter out sub-modules from the dropdown
            const standalone = srvs.filter(s => !s.parentServiceId);
            this.standaloneServices.set(standalone);
            this.servers.set(hosts);
            this.environments.set(envs);

            // If editing, map environment enum to ID
            const d = this.deployment();
            if (d && d.environment) {
                const matched = envs.find(e => e.name.toUpperCase() === d.environment);
                if (matched) {
                    this.form.patchValue({ environmentId: matched.id });
                }
            }
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
        const payload: DeploymentPayload = this.form.value;

        // Ensure numbers
        payload.serviceId = Number(payload.serviceId);
        payload.serverId = Number(payload.serverId);
        payload.environmentId = Number(payload.environmentId);
        if (payload.port) payload.port = Number(payload.port);

        try {
            let result: Deployment;
            const current = this.deployment();

            if (current) {
                result = await this.platformService.updateDeployment(url, Number(current.id), payload);
            } else {
                result = await this.platformService.createDeployment(url, payload);
            }
            this.saved.emit(result);
            this.close.emit();
        } catch (e) {
            console.error('Failed to save deployment', e);
            alert('Failed to save deployment.');
        } finally {
            this.isSaving.set(false);
        }
    }
}
