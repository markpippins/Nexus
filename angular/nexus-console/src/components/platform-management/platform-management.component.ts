import { Component, ChangeDetectionStrategy, inject, input, signal, effect, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlatformManagementService, Host } from '../../services/platform-management.service.js';
import { ServiceInstance, Framework, Deployment, Library } from '../../models/service-mesh.model.js';
import { UpsertServiceDialogComponent } from './upsert-service-dialog/upsert-service-dialog.component.js';
import { UpsertFrameworkDialogComponent } from './upsert-framework-dialog/upsert-framework-dialog.component.js';
import { UpsertDeploymentDialogComponent } from './upsert-deployment-dialog/upsert-deployment-dialog.component.js';
import { UpsertServerDialogComponent } from './upsert-server-dialog/upsert-server-dialog.component.js';
import { LookupListComponent } from './lookup-list/lookup-list.component.js';
import { UpsertLookupDialogComponent } from './upsert-lookup-dialog/upsert-lookup-dialog.component.js';
import { UpsertLibraryDialogComponent } from './upsert-library-dialog/upsert-library-dialog.component.js';
import { ServiceLibrariesDialogComponent } from './service-libraries-dialog/service-libraries-dialog.component.js';
import { LookupItem } from '../../services/platform-management.service.js';

@Component({
    selector: 'app-platform-management',
    imports: [
        CommonModule,
        UpsertServiceDialogComponent,
        UpsertFrameworkDialogComponent,
        UpsertDeploymentDialogComponent,
        UpsertServerDialogComponent,
        LookupListComponent,
        UpsertLookupDialogComponent,
        UpsertLibraryDialogComponent,
        ServiceLibrariesDialogComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="h-full flex flex-col bg-[rgb(var(--color-surface))]">
        <!-- Content -->

        <!-- Content -->
        <div class="flex-1 overflow-auto p-4">
            @if (loading()) {
                <div class="flex justify-center items-center h-32">
                    <span class="material-icons animate-spin text-2xl text-[rgb(var(--color-text-muted))]">refresh</span>
                </div>
            } @else if (error()) {
                <div class="p-4 bg-red-500/10 border border-red-500/20 rounded text-red-500">
                    {{ error() }}
                </div>
            } @else {
                @switch (managementType()) {
                    @case ('services') {
                        <div class="flex flex-col h-full">
                            <!-- Services List -->
                            <div class="overflow-x-auto flex-1">
                                <table class="w-full text-left border-collapse">
                                    <thead class="bg-[rgb(var(--color-surface-muted))] text-xs text-[rgb(var(--color-text-muted))] uppercase sticky top-0 z-10">
                                        <tr>
                                            <th (click)="onSort('name')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                                <div class="flex items-center">
                                                    Name
                                                    @if (sortState().column === 'name') {
                                                        <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                    }
                                                </div>
                                            </th>
                                            <th (click)="onSort('type')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                                <div class="flex items-center">
                                                    Type
                                                    @if (sortState().column === 'type') {
                                                        <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                    }
                                                </div>
                                            </th>
                                            <th (click)="onSort('framework')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                                <div class="flex items-center">
                                                    Framework
                                                    @if (sortState().column === 'framework') {
                                                        <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                    }
                                                </div>
                                            </th>
                                            <th (click)="onSort('status')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                                <div class="flex items-center">
                                                    Status
                                                    @if (sortState().column === 'status') {
                                                        <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                    }
                                                </div>
                                            </th>
                                            <th class="p-2 font-semibold text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @for (service of services(); track service.id) {
                                            <tr 
                                                tabindex="0"
                                                (dblclick)="onEdit(service)"
                                                (keydown.enter)="onEdit(service)"
                                                class="border-b border-[rgb(var(--color-border-base))] hover:bg-[rgb(var(--color-surface-hover))] cursor-pointer group focus:outline-none focus:bg-[rgb(var(--color-surface-hover))]"
                                                [class.border-dashed]="service.status === 'PLANNED'"
                                                [class.border-blue-400]="service.status === 'PLANNED'"
                                                [class.opacity-50]="service.status === 'DEPRECATED' || service.status === 'ARCHIVED'"
                                            >
                                                <td class="p-2 py-1.5" [class.text-[rgb(var(--color-text-base))]]="service.status === 'ACTIVE'" [class.text-[rgb(var(--color-text-muted))]]="service.status !== 'ACTIVE'" [class.line-through]="service.status === 'DEPRECATED'">
                                                    @if (service.parentServiceId) {
                                                        <span class="inline-flex items-center gap-1">
                                                            <span class="text-[rgb(var(--color-text-muted))] text-xs">└─</span>
                                                            {{ service.name }}
                                                            <span class="px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">Sub-module</span>
                                                        </span>
                                                    } @else {
                                                        {{ service.name }}
                                                    }
                                                </td>
                                                <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ service.type?.name }}</td>
                                                <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ service.framework?.name }}</td>
                                                <td class="p-2 py-1.5">
                                                    <span [class]="'px-2 py-0.5 rounded-full text-xs font-medium ' + getServiceStatusClass(service.status)">
                                                        {{ service.status }}
                                                    </span>
                                                </td>
                                                <td class="p-2 py-1.5 text-right">
                                                    <button (click)="onManageServiceLibraries(service)" class="text-purple-500 hover:underline mr-3 text-xs">Libraries</button>
                                                    <button (click)="onEdit(service)" class="text-[rgb(var(--color-accent-ring))] hover:underline mr-3 text-xs">Edit</button>
                                                    <button (click)="onDelete(service)" class="text-red-500 hover:underline text-xs">Delete</button>
                                                </td>
                                            </tr>
                                        } @empty {
                                            <tr>
                                                <td colspan="5" class="p-8 text-center text-[rgb(var(--color-text-muted))]">No services found.</td>
                                            </tr>
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    }
                    @case ('libraries') {
                        <div class="overflow-x-auto flex-1">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-[rgb(var(--color-surface-muted))] text-xs text-[rgb(var(--color-text-muted))] uppercase sticky top-0 z-10">
                                    <tr>
                                        <th (click)="onSort('name')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Name
                                                @if (sortState().column === 'name') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th (click)="onSort('category')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Category
                                                @if (sortState().column === 'category') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th (click)="onSort('language')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Language
                                                @if (sortState().column === 'language') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th (click)="onSort('package')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Package
                                                @if (sortState().column === 'package') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th (click)="onSort('version')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Version
                                                @if (sortState().column === 'version') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th class="p-2 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (lib of libraries(); track lib.id) {
                                        <tr tabindex="0" (dblclick)="onEdit(lib)" (keydown.enter)="onEdit(lib)" class="border-b border-[rgb(var(--color-border-base))] hover:bg-[rgb(var(--color-surface-hover))] cursor-pointer group focus:outline-none focus:bg-[rgb(var(--color-surface-hover))]">
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-base))]">{{ lib.name }}</td>
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ lib.category?.name || '-' }}</td>
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ lib.language?.name || '-' }}</td>
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))] font-mono text-xs">{{ lib.packageName || '-' }}</td>
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ lib.currentVersion || '-' }}</td>
                                            <td class="p-2 py-1.5 text-right">
                                                <button (click)="onEdit(lib)" class="text-[rgb(var(--color-accent-ring))] hover:underline mr-3 text-xs">Edit</button>
                                                <button (click)="onDelete(lib)" class="text-red-500 hover:underline text-xs">Delete</button>
                                            </td>
                                        </tr>
                                    } @empty {
                                        <tr>
                                            <td colspan="6" class="p-8 text-center text-[rgb(var(--color-text-muted))]">No libraries found.</td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    }
                    @case ('library-categories') {
                         <app-lookup-list
                            [items]="lookupData()"
                            [type]="managementType()"
                            (onEdit)="onEdit($event)"
                            (onDelete)="onDelete($event)"
                        ></app-lookup-list>
                    }
                    @case ('frameworks') {
                         <div class="overflow-x-auto">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-[rgb(var(--color-surface-muted))] text-xs text-[rgb(var(--color-text-muted))] uppercase sticky top-0 z-10">
                                    <tr>
                                        <th (click)="onSort('name')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Name
                                                @if (sortState().column === 'name') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th (click)="onSort('category')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Category
                                                @if (sortState().column === 'category') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th (click)="onSort('language')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Language
                                                @if (sortState().column === 'language') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th (click)="onSort('version')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Version
                                                @if (sortState().column === 'version') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th class="p-2 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (fw of frameworks(); track fw.id) {
                                        <tr tabindex="0" (dblclick)="onEdit(fw)" (keydown.enter)="onEdit(fw)" class="border-b border-[rgb(var(--color-border-base))] hover:bg-[rgb(var(--color-surface-hover))] cursor-pointer group focus:outline-none focus:bg-[rgb(var(--color-surface-hover))]">
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-base))]">{{ fw.name }}</td>
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ fw.category?.name }}</td>
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ fw.language?.name }}</td>
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ fw.currentVersion || fw.latestVersion || '-' }}</td>
                                            <td class="p-2 py-1.5 text-right">
                                                <button (click)="onEdit(fw)" class="text-[rgb(var(--color-accent-ring))] hover:underline mr-3 text-xs">Edit</button>
                                                <button (click)="onDelete(fw)" class="text-red-500 hover:underline text-xs">Delete</button>
                                            </td>
                                        </tr>
                                    } @empty {
                                        <tr>
                                            <td colspan="5" class="p-8 text-center text-[rgb(var(--color-text-muted))]">No frameworks found.</td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    }
                    @case ('deployments') {
                        <div class="overflow-x-auto">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-[rgb(var(--color-surface-muted))] text-xs text-[rgb(var(--color-text-muted))] uppercase sticky top-0 z-10">
                                    <tr>
                                        <th (click)="onSort('service')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Service
                                                @if (sortState().column === 'service') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th (click)="onSort('environment')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Environment
                                                @if (sortState().column === 'environment') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th (click)="onSort('server')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Server
                                                @if (sortState().column === 'server') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th (click)="onSort('status')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Status
                                                @if (sortState().column === 'status') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th (click)="onSort('version')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Version
                                                @if (sortState().column === 'version') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th class="p-2 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (d of deployments(); track d.id) {
                                        <tr tabindex="0" (dblclick)="onEdit(d)" (keydown.enter)="onEdit(d)" class="border-b border-[rgb(var(--color-border-base))] hover:bg-[rgb(var(--color-surface-hover))] cursor-pointer group focus:outline-none focus:bg-[rgb(var(--color-surface-hover))]">
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-base))]">
                                                @if (d.service?.parentServiceId) {
                                                    <span class="inline-flex items-center gap-1">
                                                        <span class="text-[rgb(var(--color-text-muted))] text-xs">└─</span>
                                                        {{ d.service?.name }}
                                                        <span class="px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">Sub-module</span>
                                                    </span>
                                                } @else {
                                                    {{ d.service?.name }}
                                                }
                                            </td>
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ d.environment }}</td>
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ d.server?.hostname }}</td>
                                            <td class="p-2 py-1.5">
                                                 <span [class]="'px-2 py-0.5 rounded-full text-xs font-medium ' + getStatusClass(d.status)">
                                                    {{ d.status }}
                                                </span>
                                            </td>
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ d.version }}</td>
                                            <td class="p-2 py-1.5 text-right">
                                                <button (click)="onEdit(d)" class="text-[rgb(var(--color-accent-ring))] hover:underline mr-3 text-xs">Edit</button>
                                                <button (click)="onDelete(d)" class="text-red-500 hover:underline text-xs">Delete</button>
                                            </td>
                                        </tr>
                                    } @empty {
                                        <tr>
                                            <td colspan="6" class="p-8 text-center text-[rgb(var(--color-text-muted))]">No deployments found.</td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    }
                    @case ('servers') {
                        <div class="overflow-x-auto">
                             <table class="w-full text-left border-collapse">
                                <thead class="bg-[rgb(var(--color-surface-muted))] text-xs text-[rgb(var(--color-text-muted))] uppercase sticky top-0 z-10">
                                    <tr>
                                        <th (click)="onSort('hostname')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Hostname
                                                @if (sortState().column === 'hostname') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th (click)="onSort('ipAddress')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                IP Address
                                                @if (sortState().column === 'ipAddress') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th (click)="onSort('type')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Type
                                                @if (sortState().column === 'type') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th (click)="onSort('os')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                OS
                                                @if (sortState().column === 'os') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th (click)="onSort('status')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                            <div class="flex items-center">
                                                Status
                                                @if (sortState().column === 'status') {
                                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                }
                                            </div>
                                        </th>
                                        <th class="p-2 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (s of servers(); track s.id) {
                                        <tr tabindex="0" (dblclick)="onEdit(s)" (keydown.enter)="onEdit(s)" class="border-b border-[rgb(var(--color-border-base))] hover:bg-[rgb(var(--color-surface-hover))] cursor-pointer group focus:outline-none focus:bg-[rgb(var(--color-surface-hover))]">
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-base))]">{{ s.hostname }}</td>
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ s.ipAddress }}</td>
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ s.serverTypeId }}</td> 
                                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ s.operatingSystemId }}</td>
                                            <td class="p-2 py-1.5">
                                                <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500">
                                                    {{ s.status }}
                                                </span>
                                            </td>
                                            <td class="p-2 py-1.5 text-right">
                                                <button (click)="onEdit(s)" class="text-[rgb(var(--color-accent-ring))] hover:underline mr-3 text-xs">Edit</button>
                                                <button (click)="onDelete(s)" class="text-red-500 hover:underline text-xs">Delete</button>
                                            </td>
                                        </tr>
                                    } @empty {
                                        <tr>
                                            <td colspan="6" class="p-8 text-center text-[rgb(var(--color-text-muted))]">No servers found.</td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    }
                    @case ('service-types') {
                        <app-lookup-list
                            [items]="lookupData()"
                            [type]="managementType()"
                            (onEdit)="onEdit($event)"
                            (onDelete)="onDelete($event)"
                        ></app-lookup-list>
                    }
                    @case ('server-types') {
                         <app-lookup-list
                            [items]="lookupData()"
                            [type]="managementType()"
                            (onEdit)="onEdit($event)"
                            (onDelete)="onDelete($event)"
                        ></app-lookup-list>
                    }
                    @case ('framework-languages') {
                         <app-lookup-list
                            [items]="lookupData()"
                            [type]="managementType()"
                            (onEdit)="onEdit($event)"
                            (onDelete)="onDelete($event)"
                        ></app-lookup-list>
                    }
                    @case ('framework-vendors') {
                         <app-lookup-list
                            [items]="lookupData()"
                            [type]="managementType()"
                            (onEdit)="onEdit($event)"
                            (onDelete)="onDelete($event)"
                        ></app-lookup-list>
                    }
                    @case ('framework-categories') {
                         <app-lookup-list
                            [items]="lookupData()"
                            [type]="managementType()"
                            (onEdit)="onEdit($event)"
                            (onDelete)="onDelete($event)"
                        ></app-lookup-list>
                    }
                    @case ('operating-systems') {
                         <app-lookup-list
                            [items]="lookupData()"
                            [type]="managementType()"
                            (onEdit)="onEdit($event)"
                            (onDelete)="onDelete($event)"
                        ></app-lookup-list>
                    }
                    @case ('environments') {
                         <app-lookup-list
                            [items]="lookupData()"
                            [type]="managementType()"
                            (onEdit)="onEdit($event)"
                            (onDelete)="onDelete($event)"
                        ></app-lookup-list>
                    }
                    @default {
                        <div class="p-8 text-center text-[rgb(var(--color-text-muted))]">
                            Management UI for {{ managementType() }} coming soon.
                        </div>
                    }
                }
            }
        </div>

        <!-- Dialogs -->
        <app-upsert-service-dialog
            [isOpen]="isServiceDialogOpen()"
            [baseUrl]="baseUrl()"
            [service]="selectedServiceForEdit()"
            (close)="onServiceDialogClose()"
            (saved)="onServiceSaved()"
        ></app-upsert-service-dialog>

        <app-upsert-framework-dialog
            [isOpen]="isFrameworkDialogOpen()"
            [baseUrl]="baseUrl()"
            [framework]="selectedFrameworkForEdit()"
            (close)="onFrameworkDialogClose()"
            (saved)="onFrameworkSaved()"
        ></app-upsert-framework-dialog>
        
        <app-upsert-deployment-dialog
            [isOpen]="isDeploymentDialogOpen()"
            [baseUrl]="baseUrl()"
            [deployment]="selectedDeploymentForEdit()"
            (close)="onDeploymentDialogClose()"
            (saved)="onDeploymentSaved()"
        ></app-upsert-deployment-dialog>

        <app-upsert-server-dialog
            [isOpen]="isServerDialogOpen()"
            [baseUrl]="baseUrl()"
            [server]="selectedServerForEdit()"
            (close)="onServerDialogClose()"
            (saved)="onServerSaved()"
        ></app-upsert-server-dialog>

        <app-upsert-lookup-dialog
            [isOpen]="isLookupDialogOpen()"
            [baseUrl]="baseUrl()"
            [type]="managementType()"
            [item]="selectedLookupForEdit()"
            (close)="onLookupDialogClose()"
            (saved)="onLookupSaved()"
        ></app-upsert-lookup-dialog>

        @if (isLibraryDialogOpen()) {
            <app-upsert-library-dialog
                [baseUrl]="baseUrl()"
                [library]="selectedLibraryForEdit()"
                (saved)="onLibrarySaved()"
                (cancelled)="onLibraryDialogClose()"
            ></app-upsert-library-dialog>
        }

        @if (isServiceLibrariesDialogOpen() && selectedServiceForLibraries()) {
            <app-service-libraries-dialog
                [baseUrl]="baseUrl()"
                [service]="selectedServiceForLibraries()!"
                (closed)="onServiceLibrariesDialogClose()"
            ></app-service-libraries-dialog>
        }


    </div>
  `
})
export class PlatformManagementComponent {
    managementType = input.required<string>();
    baseUrl = input.required<string>();
    toolbarAction = input<{ name: string; payload?: any; id: number } | null>(null);

    // Status info output for parent component
    statusInfo = output<{ type: string; count: number }>();

    private lastProcessedActionId = 0;

    platformService = inject(PlatformManagementService);

    // Data Signals
    // Data Signals (Raw)
    private rawServices = signal<ServiceInstance[]>([]);
    private rawFrameworks = signal<Framework[]>([]);
    private rawDeployments = signal<Deployment[]>([]);
    private rawServers = signal<Host[]>([]);
    private rawLibraries = signal<Library[]>([]);

    loading = signal(false);
    error = signal<string | null>(null);

    // Sort State
    sortState = signal<{ column: string; direction: 'asc' | 'desc' }>({ column: 'name', direction: 'asc' });

    // Computed Sorted Signals
    services = computed(() => {
        const raw = this.rawServices();
        const sort = this.sortState();

        // Separate standalone (parent) services from sub-modules
        const standalone = raw.filter(s => !s.parentServiceId);
        const subModules = raw.filter(s => s.parentServiceId);

        // Sort standalone services
        const sortedStandalone = this.sortData(standalone, sort, (item, col) => {
            switch (col) {
                case 'name': return item.name;
                case 'type': return item.type?.name;
                case 'framework': return item.framework?.name;
                case 'status': return item.status;
                default: return (item as any)[col];
            }
        });

        // Build the grouped list: parent followed by its children
        const result: ServiceInstance[] = [];
        for (const parent of sortedStandalone) {
            result.push(parent);
            // Find and sort sub-modules for this parent
            const children = subModules.filter(s => s.parentServiceId === Number(parent.id));
            const sortedChildren = this.sortData(children, sort, (item, col) => {
                switch (col) {
                    case 'name': return item.name;
                    case 'type': return item.type?.name;
                    case 'framework': return item.framework?.name;
                    case 'status': return item.status;
                    default: return (item as any)[col];
                }
            });
            result.push(...sortedChildren);
        }

        // Add any orphaned sub-modules (parent not in list) at the end
        const placedIds = new Set(result.map(s => s.id));
        const orphans = subModules.filter(s => !placedIds.has(s.id));
        result.push(...orphans);

        return result;
    });

    frameworks = computed(() => {
        return this.sortData(this.rawFrameworks(), this.sortState(), (item, col) => {
            switch (col) {
                case 'name': return item.name;
                case 'category': return item.category?.name;
                case 'language': return item.language?.name;
                case 'version': return item.currentVersion || item.latestVersion;
                default: return (item as any)[col];
            }
        });
    });

    deployments = computed(() => {
        return this.sortData(this.rawDeployments(), this.sortState(), (item, col) => {
            switch (col) {
                case 'service': return item.service?.name;
                case 'environment': return item.environment;
                case 'server': return item.server?.hostname;
                case 'status': return item.status;
                case 'version': return item.version;
                default: return (item as any)[col];
            }
        });
    });

    servers = computed(() => {
        return this.sortData(this.rawServers(), this.sortState(), (item, col) => {
            switch (col) {
                case 'hostname': return item.hostname;
                case 'ipAddress': return item.ipAddress;
                case 'type': return item.serverTypeId;
                case 'os': return item.operatingSystemId;
                case 'status': return item.status;
                default: return (item as any)[col];
            }
        });
    });

    libraries = computed(() => {
        return this.sortData(this.rawLibraries(), this.sortState(), (item, col) => {
            switch (col) {
                case 'name': return item.name;
                case 'category': return item.category?.name;
                case 'language': return item.language?.name;
                case 'package': return item.packageName;
                case 'version': return item.currentVersion;
                default: return (item as any)[col];
            }
        });
    });

    // Dialog State
    isServiceDialogOpen = signal(false);
    selectedServiceForEdit = signal<ServiceInstance | null>(null);

    isFrameworkDialogOpen = signal(false);
    selectedFrameworkForEdit = signal<Framework | null>(null);

    isDeploymentDialogOpen = signal(false);
    selectedDeploymentForEdit = signal<Deployment | null>(null);

    isServerDialogOpen = signal(false);
    selectedServerForEdit = signal<Host | null>(null);

    // Lookup State
    lookupData = signal<LookupItem[]>([]);
    isLookupDialogOpen = signal(false);
    selectedLookupForEdit = signal<LookupItem | null>(null);

    // Library Dialog State
    isLibraryDialogOpen = signal(false);
    selectedLibraryForEdit = signal<Library | null>(null);

    // Service Libraries Dialog State
    isServiceLibrariesDialogOpen = signal(false);
    selectedServiceForLibraries = signal<ServiceInstance | null>(null);

    // Tab State for Generic Service View
    activeTab = signal<string>('services');

    private componentStartTime = Date.now();

    constructor() {
        effect(() => {
            // Reset active tab when management type changes
            if (this.managementType()) {
                this.activeTab.set(this.managementType() === 'services' ? 'services' : this.managementType());
                // Reset sort on type change
                this.sortState.set({ column: 'name', direction: 'asc' });
            }
        });

        effect(() => {
            // Explicitly read signals to establish dependencies
            const type = this.managementType();
            const url = this.baseUrl();
            const tab = this.activeTab();

            // Load data whenever management type, base URL, OR active tab changes
            if (type && url) {
                this.loadData();
            }
        });

        effect(() => {
            // Listen for toolbar actions - only process new actions
            const action = this.toolbarAction();
            if (action) {
                // Ignore actions that happened before this component was created
                const isNewAction = action.id > this.componentStartTime;

                if (isNewAction && action.id !== this.lastProcessedActionId) {
                    this.lastProcessedActionId = action.id;
                    if (action.name === 'newFolder') {
                        this.onAdd();
                    }
                } else {
                    // Mark as processed so we don't accidentally process it if logic changes
                    this.lastProcessedActionId = action.id;
                }
            }
        });

        // Emit status info when data changes
        effect(() => {
            const type = this.managementType();
            let count = 0;
            let displayType = type;

            switch (type) {
                case 'services':
                    count = this.services().length;
                    displayType = 'Services';
                    break;
                case 'frameworks':
                    count = this.frameworks().length;
                    displayType = 'Frameworks';
                    break;
                case 'deployments':
                    count = this.deployments().length;
                    displayType = 'Deployments';
                    break;
                case 'servers':
                    count = this.servers().length;
                    displayType = 'Servers';
                    break;
                case 'libraries':
                    count = this.libraries().length;
                    displayType = 'Libraries';
                    break;
                case 'service-types':
                case 'server-types':
                case 'framework-languages':
                case 'framework-vendors':
                case 'framework-categories':
                case 'library-categories':
                case 'operating-systems':
                case 'environments':
                    count = this.lookupData().length;
                    displayType = type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    break;
            }

            if (type) {
                this.statusInfo.emit({ type: displayType, count });
            }
        });
    }

    private sortData<T>(data: T[], sort: { column: string; direction: 'asc' | 'desc' }, getValue: (item: T, col: string) => any): T[] {
        if (!sort.column) return data;

        return [...data].sort((a, b) => {
            const valA = getValue(a, sort.column);
            const valB = getValue(b, sort.column);

            if (valA === valB) return 0;

            const comparison = valA < valB ? -1 : 1;
            return sort.direction === 'asc' ? comparison : -comparison;
        });
    }

    onSort(column: string) {
        this.sortState.update(current => ({
            column,
            direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    }

    async loadData() {
        const type = this.managementType();
        const url = this.baseUrl();
        const activeTab = this.activeTab();

        if (!type || !url) {
            console.warn('[PlatformManagement] loadData skipped - missing type or url', { type, url });
            return;
        }

        console.log('[PlatformManagement] loadData starting', { type, url, activeTab });

        this.loading.set(true);
        this.error.set(null);

        // Determine what to load based on type and active tab
        // If type is services, we might be looking at a lookup map
        const actualType = (type === 'services' && activeTab !== 'services') ? activeTab : type;

        try {
            switch (actualType) {
                case 'services':
                    console.log('[PlatformManagement] Fetching services from', `${url}/api/v1/services`);
                    const s = await this.platformService.getServices(url);
                    console.log('[PlatformManagement] Services loaded', s.length);
                    this.rawServices.set(s);
                    break;
                case 'frameworks':
                    const f = await this.platformService.getFrameworks(url);
                    this.rawFrameworks.set(f);
                    break;
                case 'deployments':
                    const d = await this.platformService.getDeployments(url);
                    this.rawDeployments.set(d);
                    break;
                case 'servers':
                    const h = await this.platformService.getServers(url);
                    this.rawServers.set(h);
                    break;
                case 'service-types':
                case 'server-types':
                case 'framework-languages':
                case 'framework-vendors':
                case 'framework-categories':
                case 'library-categories':
                case 'operating-systems':
                case 'environments':
                    const l = await this.platformService.getLookup(url, actualType);
                    this.lookupData.set(l);
                    break;
                case 'libraries':
                    const libs = await this.platformService.getLibraries(url);
                    this.rawLibraries.set(libs);
                    break;
            }
        } catch (e) {
            console.error('Error loading data', e);
            this.error.set(`Failed to load ${actualType}`);
        } finally {
            this.loading.set(false);
        }
    }

    onAdd() {
        const type = this.managementType();
        const currentTab = this.activeTab();
        const actualType = (type === 'services' && currentTab !== 'services') ? currentTab : type;

        switch (actualType) {
            case 'services':
                this.selectedServiceForEdit.set(null);
                this.isServiceDialogOpen.set(true);
                break;
            case 'frameworks':
                this.selectedFrameworkForEdit.set(null);
                this.isFrameworkDialogOpen.set(true);
                break;
            case 'deployments':
                this.selectedDeploymentForEdit.set(null);
                this.isDeploymentDialogOpen.set(true);
                break;
            case 'servers':
                this.selectedServerForEdit.set(null);
                this.isServerDialogOpen.set(true);
                break;
            case 'service-types':
            case 'server-types':
            case 'framework-languages':
            case 'framework-vendors':
            case 'framework-categories':
            case 'library-categories':
            case 'operating-systems':
            case 'environments':
                this.selectedLookupForEdit.set(null);
                this.isLookupDialogOpen.set(true);
                break;
            case 'libraries':
                this.selectedLibraryForEdit.set(null);
                this.isLibraryDialogOpen.set(true);
                break;
        }
    }

    onEdit(item: any) {
        const type = this.managementType();
        const currentTab = this.activeTab();
        const actualType = (type === 'services' && currentTab !== 'services') ? currentTab : type;

        switch (actualType) {
            case 'services':
                this.selectedServiceForEdit.set(item);
                this.isServiceDialogOpen.set(true);
                break;
            case 'frameworks':
                this.selectedFrameworkForEdit.set(item);
                this.isFrameworkDialogOpen.set(true);
                break;
            case 'deployments':
                this.selectedDeploymentForEdit.set(item);
                this.isDeploymentDialogOpen.set(true);
                break;
            case 'servers':
                this.selectedServerForEdit.set(item);
                this.isServerDialogOpen.set(true);
                break;
            case 'service-types':
            case 'server-types':
            case 'framework-languages':
            case 'framework-categories':
            case 'library-categories':
            case 'operating-systems':
            case 'environments':
                this.selectedLookupForEdit.set(item);
                this.isLookupDialogOpen.set(true);
                break;
            case 'libraries':
                this.selectedLibraryForEdit.set(item);
                this.isLibraryDialogOpen.set(true);
                break;
        }
    }

    async onDelete(item: any) {
        if (!confirm('Are you sure you want to delete this item?')) return;

        const type = this.managementType();
        const url = this.baseUrl();
        const currentTab = this.activeTab();
        const actualType = (type === 'services' && currentTab !== 'services') ? currentTab : type;

        try {
            switch (actualType) {
                case 'services':
                    await this.platformService.deleteService(url, Number(item.id));
                    break;
                case 'frameworks':
                    await this.platformService.deleteFramework(url, Number(item.id));
                    break;
                case 'deployments':
                    await this.platformService.deleteDeployment(url, Number(item.id));
                    break;
                case 'servers':
                    await this.platformService.deleteServer(url, Number(item.id));
                    break;
                case 'service-types':
                case 'server-types':
                case 'framework-languages':
                case 'framework-categories':
                case 'library-categories':
                case 'operating-systems':
                case 'environments':
                    await this.platformService.deleteLookup(url, actualType, Number(item.id));
                    break;
                case 'libraries':
                    await this.platformService.deleteLibrary(url, Number(item.id));
                    break;
            }
            this.loadData(); // Refresh
        } catch (e) {
            console.error('Delete failed', e);
            alert('Failed to delete item');
        }
    }

    // Service Dialog Handlers
    onServiceDialogClose() {
        this.isServiceDialogOpen.set(false);
        this.selectedServiceForEdit.set(null);
    }

    onServiceSaved() {
        this.loadData();
    }

    // Framework Dialog Handlers
    onFrameworkDialogClose() {
        this.isFrameworkDialogOpen.set(false);
        this.selectedFrameworkForEdit.set(null);
    }

    onFrameworkSaved() {
        this.loadData();
    }

    // Deployment Dialog Handlers
    onDeploymentDialogClose() {
        this.isDeploymentDialogOpen.set(false);
        this.selectedDeploymentForEdit.set(null);
    }

    onDeploymentSaved() {
        this.loadData();
    }

    // Server Dialog Handlers
    onServerDialogClose() {
        this.isServerDialogOpen.set(false);
        this.selectedServerForEdit.set(null);
    }

    onServerSaved() {
        this.loadData();
    }

    getStatusClass(status: string | undefined): string {
        if (!status) return 'bg-gray-500/10 text-gray-500';
        switch (status) {
            case 'RUNNING': return 'bg-green-500/10 text-green-500';
            case 'STOPPED': return 'bg-gray-500/10 text-gray-500';
            case 'STARTING': return 'bg-yellow-500/10 text-yellow-500';
            case 'FAILED': return 'bg-red-500/10 text-red-500';
            default: return 'bg-gray-500/10 text-gray-500';
        }
    }

    getServiceStatusClass(status: string | undefined): string {
        if (!status) return 'bg-gray-500/10 text-gray-500';
        switch (status) {
            case 'ACTIVE': return 'bg-green-500/10 text-green-500';
            case 'DEPRECATED': return 'bg-yellow-500/10 text-yellow-500';
            case 'ARCHIVED': return 'bg-gray-500/10 text-gray-500';
            case 'PLANNED': return 'bg-blue-500/10 text-blue-500';
            default: return 'bg-gray-500/10 text-gray-500';
        }
    }

    // Lookup Dialog Handlers
    onLookupDialogClose() {
        this.isLookupDialogOpen.set(false);
        this.selectedLookupForEdit.set(null);
    }

    onLookupSaved() {
        this.loadData();
    }

    // Library Dialog Handlers
    onLibraryDialogClose() {
        this.isLibraryDialogOpen.set(false);
        this.selectedLibraryForEdit.set(null);
    }

    onLibrarySaved() {
        this.isLibraryDialogOpen.set(false);
        this.selectedLibraryForEdit.set(null);
        this.loadData();
    }

    // Service Libraries Dialog Handlers
    onManageServiceLibraries(service: ServiceInstance) {
        this.selectedServiceForLibraries.set(service);
        this.isServiceLibrariesDialogOpen.set(true);
    }

    onServiceLibrariesDialogClose() {
        this.isServiceLibrariesDialogOpen.set(false);
        this.selectedServiceForLibraries.set(null);
    }
}
