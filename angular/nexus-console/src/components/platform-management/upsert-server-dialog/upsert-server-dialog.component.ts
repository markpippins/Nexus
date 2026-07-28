import { Component, ChangeDetectionStrategy, inject, signal, input, output, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { PlatformManagementService, LookupItem, Server, LOOKUP_SERVER_TYPES, LOOKUP_ENVIRONMENTS, LOOKUP_OPERATING_SYSTEMS } from '../../../services/platform-management.service.js';

@Component({
    selector: 'app-upsert-server-dialog',
    imports: [CommonModule, ReactiveFormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    @if (isOpen()) {
    <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" (window:keydown.escape)="onCancel()">
       <div class="bg-[rgb(var(--color-surface))] border border-[rgb(var(--color-border-base))] shadow-2xl rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
          <div class="px-5 py-3.5 border-b border-[rgb(var(--color-border-base))] flex justify-between items-center">
            <h2 class="text-base font-semibold text-[rgb(var(--color-text-prominent))]">
              {{ server() ? 'Edit' : 'Add' }} Server
            </h2>
            <button (click)="onCancel()" class="p-1 rounded-md text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] transition-colors">
              <span class="material-icons">close</span>
            </button>
          </div>
          
          <div class="px-5 py-4 overflow-y-auto flex-1">
             <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-3.5">
                 <!-- Hostname & IP -->
                 <div class="grid grid-cols-2 gap-4">
                     <div class="flex flex-col gap-1.5">
                        <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Hostname *</label>
                        <input type="text" formControlName="hostname" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="server-01">
                     </div>
                     <div class="flex flex-col gap-1.5">
                        <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">IP Address *</label>
                         <input type="text" formControlName="ipAddress" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="192.168.1.10">
                     </div>
                 </div>

                 <!-- Server Type & Env -->
                 <div class="grid grid-cols-2 gap-4">
                     <div class="flex flex-col gap-1.5">
                         <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Server Type *</label>
                        <select formControlName="serverTypeId" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors">
                             <option [value]="null">Select Type</option>
                            @for (t of serverTypes(); track t.id) {
                                <option [value]="t.id">{{ t.name }}</option>
                            }
                        </select>
                     </div>
                     <div class="flex flex-col gap-1.5">
                        <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Environment *</label>
                        <select formControlName="environmentTypeId" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors">
                            <option [value]="null">Select Env</option>
                            @for (e of environmentTypes(); track e.id) {
                                <option [value]="e.id">{{ e.name }}</option>
                            }
                        </select>
                     </div>
                 </div>

                 <!-- OS & Status -->
                 <div class="grid grid-cols-2 gap-4">
                     <div class="flex flex-col gap-1.5">
                        <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Operating System *</label>
                        <select formControlName="operatingSystemId" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors">
                            <option [value]="null">Select OS</option>
                            @for (os of operatingSystems(); track os.id) {
                                <option [value]="os.id">{{ os.name }}{{ os.version ? ' ' + os.version : '' }}{{ os.ltsFlag ? ' (LTS)' : '' }}</option>
                            }
                        </select>
                     </div>
                     <div class="flex flex-col gap-1.5">
                        <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Status</label>
                         <select formControlName="status" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors">
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="INACTIVE">INACTIVE</option>
                            <option value="MAINTENANCE">MAINTENANCE</option>
                            <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                        </select>
                     </div>
                 </div>

                 <!-- Specs -->
                 <div class="grid grid-cols-3 gap-4">
                     <div class="flex flex-col gap-1.5">
                        <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">CPU Cores</label>
                        <input type="number" formControlName="cpuCores" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="4">
                     </div>
                     <div class="flex flex-col gap-1.5">
                        <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Memory</label>
                        <input type="text" formControlName="memory" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="16GB">
                     </div>
                     <div class="flex flex-col gap-1.5">
                        <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Disk</label>
                        <input type="text" formControlName="disk" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="500GB">
                     </div>
                 </div>
                 
                 <!-- Cloud -->
                 <div class="grid grid-cols-2 gap-4">
                     <div class="flex flex-col gap-1.5">
                        <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Cloud Provider</label>
                        <input type="text" formControlName="cloudProvider" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="AWS">
                     </div>
                     <div class="flex flex-col gap-1.5">
                        <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Region</label>
                        <input type="text" formControlName="region" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="us-east-1">
                     </div>
                 </div>

                 <!-- Description -->
                 <div class="flex flex-col gap-1.5">
                    <label class="text-xs font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wide">Description</label>
                     <textarea formControlName="description" rows="2" class="w-full px-3 py-2 text-sm rounded-md border border-[rgb(var(--color-border-muted))] bg-[rgb(var(--color-surface-input))] text-[rgb(var(--color-text-base))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))]/30 focus:border-[rgb(var(--color-accent-ring))] transition-colors" placeholder="Server description"></textarea>
                 </div>
             </form>
          </div>

          <div class="px-5 py-3.5 border-t border-[rgb(var(--color-border-base))] flex justify-end gap-2.5 bg-[rgb(var(--color-surface-muted))]">
             <button type="button" (click)="onCancel()" class="px-3.5 py-1.5 text-sm font-medium rounded-md text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))] transition-colors">Cancel</button>
             <button type="button" (click)="onSubmit()" [disabled]="form.invalid || isSaving()" class="px-4 py-1.5 text-sm font-semibold rounded-md bg-[rgb(var(--color-accent-ring))] text-white hover:bg-[rgb(var(--color-accent-ring))]/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors">
                @if (isSaving()) {
                    <span class="material-icons text-sm animate-spin">refresh</span>
                }
                Save
             </button>
          </div>
       </div>
    </div>
    }
  `
})
export class UpsertServerDialogComponent implements OnInit {
    private fb = inject(FormBuilder);
    private platformService = inject(PlatformManagementService);

    isOpen = input.required<boolean>();
    baseUrl = input.required<string>();
    server = input<Server | null>(null);

    close = output<void>();
    saved = output<Server>();

    form: FormGroup;

    serverTypes = signal<LookupItem[]>([]);
    environmentTypes = signal<LookupItem[]>([]);
    operatingSystems = signal<LookupItem[]>([]);

    isSaving = signal(false);

    constructor() {
        this.form = this.fb.group({
            hostname: ['', Validators.required],
            ipAddress: ['', Validators.required],
            serverTypeId: [null, Validators.required],
            environmentTypeId: [null, Validators.required],
            operatingSystemId: [null, Validators.required],
            cpuCores: [null],
            memory: [''],
            disk: [''],
            status: ['ACTIVE'],
            region: [''],
            cloudProvider: [''],
            description: ['']
        });

        effect(() => {
            if (this.isOpen()) {
                this.loadOptions();
                const s = this.server();
                if (s) {
                    this.form.patchValue({
                        hostname: s.hostname,
                        ipAddress: s.ipAddress,
                        serverTypeId: s.serverTypeId,
                        environmentTypeId: s.environmentTypeId,
                        operatingSystemId: s.operatingSystemId,
                        cpuCores: s.cpuCores,
                        memory: s.memory,
                        disk: s.disk,
                        status: s.status,
                        region: s.region,
                        cloudProvider: s.cloudProvider,
                        description: s.description
                    });
                } else {
                    this.form.reset({
                        status: 'ACTIVE'
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
            // Load all lookups in parallel
            const [st, et, os] = await Promise.all([
                this.platformService.getLookup(url, LOOKUP_SERVER_TYPES).then(r => r.data).catch(() => []),
                this.platformService.getLookup(url, LOOKUP_ENVIRONMENTS).then(r => r.data).catch(() => []),
                this.platformService.getLookup(url, LOOKUP_OPERATING_SYSTEMS).then(r => r.data).catch(() => [])
            ]);
            this.serverTypes.set(st);
            this.environmentTypes.set(et);

            // If operating systems loaded successfully, use them; otherwise use defaults
            if (os && os.length > 0) {
                this.operatingSystems.set(os);
            } else {
                this.useDefaultOS();
            }

        } catch (e) {
            console.error('Failed to load server options', e);
            // Use defaults if fetching fails
            this.useDefaultOS();
        }
    }

    useDefaultOS() {
        this.operatingSystems.set([
            { id: 1, name: 'Windows Server', version: '2022', ltsFlag: true },
            { id: 2, name: 'Ubuntu', version: '22.04', ltsFlag: true },
            { id: 3, name: 'CentOS', version: '8', ltsFlag: false },
            { id: 4, name: 'Red Hat Enterprise Linux', version: '9', ltsFlag: true },
            { id: 5, name: 'Debian', version: '12', ltsFlag: true }
        ]);
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
        const payload: Partial<Server> = this.form.value;

        // Ensure numbers
        payload.serverTypeId = Number(payload.serverTypeId);
        payload.environmentTypeId = Number(payload.environmentTypeId);
        payload.operatingSystemId = Number(payload.operatingSystemId);
        if (payload.cpuCores) payload.cpuCores = Number(payload.cpuCores);

        try {
            let result: Server;
            const current = this.server();

            if (current) {
                result = await this.platformService.updateServer(url, Number(current.id), payload);
            } else {
                result = await this.platformService.createServer(url, payload);
            }
            this.saved.emit(result);
            this.close.emit();
        } catch (e) {
            console.error('Failed to save server', e);
            alert('Failed to save server.');
        } finally {
            this.isSaving.set(false);
        }
    }
}
