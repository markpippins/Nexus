import { Component, ChangeDetectionStrategy, inject, input, signal, effect, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlatformManagementService, Server, SystemItem, getCategoryEndpointType } from '../../services/platform-management.service.js';
import { UpsertServerDialogComponent } from './upsert-server-dialog/upsert-server-dialog.component.js';
import { ServiceMeshService } from '../../services/service-mesh.service.js';
import { ComponentRegistryService } from '../../services/component-registry.service.js';
import { ServiceInstance, Framework, Deployment, Library } from '../../models/service-mesh.model.js';
import { UpsertServiceDialogComponent } from './upsert-service-dialog/upsert-service-dialog.component.js';
import { UpsertFrameworkDialogComponent } from './upsert-framework-dialog/upsert-framework-dialog.component.js';
import { UpsertDeploymentDialogComponent } from './upsert-deployment-dialog/upsert-deployment-dialog.component.js';
import { LookupListComponent } from './lookup-list/lookup-list.component.js';
import { UpsertLookupDialogComponent } from './upsert-lookup-dialog/upsert-lookup-dialog.component.js';
import { UpsertLibraryDialogComponent } from './upsert-library-dialog/upsert-library-dialog.component.js';
import { UpsertSystemDialogComponent } from './upsert-system-dialog/upsert-system-dialog.component.js';
import { CategoriesViewComponent } from './categories-view/categories-view.component.js';
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
        UpsertSystemDialogComponent,
        CategoriesViewComponent
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
                @switch (displayType()) {
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
                                                    <button (click)="onEdit(service)" class="text-[rgb(var(--color-accent-ring))] hover:underline mr-3 text-xs">Edit</button>
                                                    <button (click)="onDelete(service)" class="text-red-500 hover:underline text-xs">Delete</button>
                                                </td>
                                            </tr>
                                        } @empty {
                                            <tr>
                                                <td colspan="5" class="p-8 text-center text-[rgb(var(--color-text-muted))]">No services found.</td>
                                            </tr>
                                        }                                </tbody>
                            </table>
                            <!-- Pagination -->
                            @if (totalPages() > 1 || totalItems() > 0) {
                                <div class="flex items-center justify-between px-2 py-2.5 border-t border-[rgb(var(--color-border-base))] bg-[rgb(var(--color-surface-muted))]">
                                    <div class="text-xs text-[rgb(var(--color-text-muted))]">
                                        {{ pageStartIndex() }}–{{ pageEndIndex() }} of {{ totalItems() }}
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <!-- Rows per page selector -->
                                        <div class="flex items-center gap-1.5">
                                            <label class="text-xs text-[rgb(var(--color-text-muted))]">Rows:</label>
                                            <select
                                                (change)="onPageSizeChange($event)"
                                                class="px-2 py-1 rounded text-xs bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] border border-[rgb(var(--color-border-muted))] focus:outline-none focus:border-[rgb(var(--color-accent-ring))] cursor-pointer hover:bg-[rgb(var(--color-surface-hover))] transition-colors"
                                            >
                                                @for (s of pageSizes; track s) {
                                                    <option [value]="s" [selected]="perPage() === s">{{ s }}</option>
                                                }
                                            </select>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <button
                                                (click)="onPrevPage()"
                                                [disabled]="currentPage() === 0"
                                                class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                                [class]="currentPage() === 0
                                                    ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-muted))] opacity-50 cursor-not-allowed'
                                                    : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))]'"
                                            >
                                                ← Previous
                                            </button>
                                            <span class="text-xs text-[rgb(var(--color-text-muted))] font-medium flex items-center gap-1">
                                                <span>Page</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    [max]="totalPages()"
                                                    [value]="currentPage() + 1"
                                                    (keydown.enter)="goToPage($event)"
                                                    (blur)="goToPage($event)"
                                                    class="w-10 px-1 py-0.5 text-center text-xs bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] border border-[rgb(var(--color-border-muted))] rounded focus:outline-none focus:border-[rgb(var(--color-accent-ring))]"
                                                >
                                                <span>of {{ totalPages() }}</span>
                                            </span>
                                            <button
                                                (click)="onNextPage()"
                                                [disabled]="currentPage() >= totalPages() - 1"
                                                class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                                [class]="currentPage() >= totalPages() - 1
                                                    ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-muted))] opacity-50 cursor-not-allowed'
                                                    : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))]'"
                                            >
                                                Next →
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            }
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
                            <!-- Pagination -->
                            @if (totalPages() > 1 || totalItems() > 0) {
                                <div class="flex items-center justify-between px-2 py-2.5 border-t border-[rgb(var(--color-border-base))] bg-[rgb(var(--color-surface-muted))]">
                                    <div class="text-xs text-[rgb(var(--color-text-muted))]">
                                        {{ pageStartIndex() }}–{{ pageEndIndex() }} of {{ totalItems() }}
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <!-- Rows per page selector -->
                                        <div class="flex items-center gap-1.5">
                                            <label class="text-xs text-[rgb(var(--color-text-muted))]">Rows:</label>
                                            <select
                                                (change)="onPageSizeChange($event)"
                                                class="px-2 py-1 rounded text-xs bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] border border-[rgb(var(--color-border-muted))] focus:outline-none focus:border-[rgb(var(--color-accent-ring))] cursor-pointer hover:bg-[rgb(var(--color-surface-hover))] transition-colors"
                                            >
                                                @for (s of pageSizes; track s) {
                                                    <option [value]="s" [selected]="perPage() === s">{{ s }}</option>
                                                }
                                            </select>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <button
                                                (click)="onPrevPage()"
                                                [disabled]="currentPage() === 0"
                                                class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                                [class]="currentPage() === 0
                                                    ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-muted))] opacity-50 cursor-not-allowed'
                                                    : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))]'"
                                            >
                                                ← Previous
                                            </button>
                                            <span class="text-xs text-[rgb(var(--color-text-muted))] font-medium flex items-center gap-1">
                                                <span>Page</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    [max]="totalPages()"
                                                    [value]="currentPage() + 1"
                                                    (keydown.enter)="goToPage($event)"
                                                    (blur)="goToPage($event)"
                                                    class="w-10 px-1 py-0.5 text-center text-xs bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] border border-[rgb(var(--color-border-muted))] rounded focus:outline-none focus:border-[rgb(var(--color-accent-ring))]"
                                                >
                                                <span>of {{ totalPages() }}</span>
                                            </span>
                                            <button
                                                (click)="onNextPage()"
                                                [disabled]="currentPage() >= totalPages() - 1"
                                                class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                                [class]="currentPage() >= totalPages() - 1
                                                    ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-muted))] opacity-50 cursor-not-allowed'
                                                    : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))]'"
                                            >
                                                Next →
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            }
                        </div>
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
                            <!-- Pagination -->
                            @if (totalPages() > 1 || totalItems() > 0) {
                                <div class="flex items-center justify-between px-2 py-2.5 border-t border-[rgb(var(--color-border-base))] bg-[rgb(var(--color-surface-muted))]">
                                    <div class="text-xs text-[rgb(var(--color-text-muted))]">
                                        {{ pageStartIndex() }}–{{ pageEndIndex() }} of {{ totalItems() }}
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <!-- Rows per page selector -->
                                        <div class="flex items-center gap-1.5">
                                            <label class="text-xs text-[rgb(var(--color-text-muted))]">Rows:</label>
                                            <select
                                                (change)="onPageSizeChange($event)"
                                                class="px-2 py-1 rounded text-xs bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] border border-[rgb(var(--color-border-muted))] focus:outline-none focus:border-[rgb(var(--color-accent-ring))] cursor-pointer hover:bg-[rgb(var(--color-surface-hover))] transition-colors"
                                            >
                                                @for (s of pageSizes; track s) {
                                                    <option [value]="s" [selected]="perPage() === s">{{ s }}</option>
                                                }
                                            </select>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <button
                                                (click)="onPrevPage()"
                                                [disabled]="currentPage() === 0"
                                                class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                                [class]="currentPage() === 0
                                                    ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-muted))] opacity-50 cursor-not-allowed'
                                                    : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))]'"
                                            >
                                                ← Previous
                                            </button>
                                            <span class="text-xs text-[rgb(var(--color-text-muted))] font-medium flex items-center gap-1">
                                                <span>Page</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    [max]="totalPages()"
                                                    [value]="currentPage() + 1"
                                                    (keydown.enter)="goToPage($event)"
                                                    (blur)="goToPage($event)"
                                                    class="w-10 px-1 py-0.5 text-center text-xs bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] border border-[rgb(var(--color-border-muted))] rounded focus:outline-none focus:border-[rgb(var(--color-accent-ring))]"
                                                >
                                                <span>of {{ totalPages() }}</span>
                                            </span>
                                            <button
                                                (click)="onNextPage()"
                                                [disabled]="currentPage() >= totalPages() - 1"
                                                class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                                [class]="currentPage() >= totalPages() - 1
                                                    ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-muted))] opacity-50 cursor-not-allowed'
                                                    : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))]'"
                                            >
                                                Next →
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            }
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
                            <!-- Pagination -->
                            @if (totalPages() > 1 || totalItems() > 0) {
                                <div class="flex items-center justify-between px-2 py-2.5 border-t border-[rgb(var(--color-border-base))] bg-[rgb(var(--color-surface-muted))]">
                                    <div class="text-xs text-[rgb(var(--color-text-muted))]">
                                        {{ pageStartIndex() }}–{{ pageEndIndex() }} of {{ totalItems() }}
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <!-- Rows per page selector -->
                                        <div class="flex items-center gap-1.5">
                                            <label class="text-xs text-[rgb(var(--color-text-muted))]">Rows:</label>
                                            <select
                                                (change)="onPageSizeChange($event)"
                                                class="px-2 py-1 rounded text-xs bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] border border-[rgb(var(--color-border-muted))] focus:outline-none focus:border-[rgb(var(--color-accent-ring))] cursor-pointer hover:bg-[rgb(var(--color-surface-hover))] transition-colors"
                                            >
                                                @for (s of pageSizes; track s) {
                                                    <option [value]="s" [selected]="perPage() === s">{{ s }}</option>
                                                }
                                            </select>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <button
                                                (click)="onPrevPage()"
                                                [disabled]="currentPage() === 0"
                                                class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                                [class]="currentPage() === 0
                                                    ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-muted))] opacity-50 cursor-not-allowed'
                                                    : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))]'"
                                            >
                                                ← Previous
                                            </button>
                                            <span class="text-xs text-[rgb(var(--color-text-muted))] font-medium flex items-center gap-1">
                                                <span>Page</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    [max]="totalPages()"
                                                    [value]="currentPage() + 1"
                                                    (keydown.enter)="goToPage($event)"
                                                    (blur)="goToPage($event)"
                                                    class="w-10 px-1 py-0.5 text-center text-xs bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] border border-[rgb(var(--color-border-muted))] rounded focus:outline-none focus:border-[rgb(var(--color-accent-ring))]"
                                                >
                                                <span>of {{ totalPages() }}</span>
                                            </span>
                                            <button
                                                (click)="onNextPage()"
                                                [disabled]="currentPage() >= totalPages() - 1"
                                                class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                                [class]="currentPage() >= totalPages() - 1
                                                    ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-muted))] opacity-50 cursor-not-allowed'
                                                    : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))]'"
                                            >
                                                Next →
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            }
                        </div>
                    }
                    @case ('servers') {
                        <div class="flex flex-col h-full">
                            <!-- Hosts / Servers List -->
                            <div class="overflow-x-auto flex-1">
                                <table class="w-full text-left border-collapse">
                                    <thead class="bg-[rgb(var(--color-surface-muted))] text-xs text-[rgb(var(--color-text-muted))] uppercase sticky top-0 z-10">
                                        <tr>
                                            <th (click)="onSort('hostname')" class="p-2 font-semibold w-1/4 cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
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
                                            <th (click)="onSort('serverTypeId')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                                <div class="flex items-center">
                                                    Type
                                                    @if (sortState().column === 'serverTypeId') {
                                                        <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                    }
                                                </div>
                                            </th>
                                            <th class="p-2 font-semibold text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @for (h of servers(); track h.id) {
                                            <tr 
                                                tabindex="0"
                                                (dblclick)="onEdit(h)"
                                                (keydown.enter)="onEdit(h)"
                                                class="border-b border-[rgb(var(--color-border-base))] hover:bg-[rgb(var(--color-surface-hover))] cursor-pointer group focus:outline-none focus:bg-[rgb(var(--color-surface-hover))]"
                                            >
                                                <td class="p-2 py-1.5 text-[rgb(var(--color-text-base))] font-medium">{{ h.hostname }}</td>
                                                <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ h.ipAddress || '-' }}</td>
                                                <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ h.serverTypeId || '-' }}</td>
                                                <td class="p-2 py-1.5 text-right whitespace-nowrap">
                                                    <button (click)="onEdit(h)" class="text-[rgb(var(--color-accent-ring))] hover:underline mr-3 text-xs">Edit</button>
                                                    <button (click)="onDelete(h)" class="text-red-500 hover:underline text-xs">Delete</button>
                                                </td>
                                            </tr>
                                        } @empty {
                                            <tr>
                                                <td colspan="4" class="p-8 text-center text-[rgb(var(--color-text-muted))]">
                                                    No hosts found.
                                                </td>
                                            </tr>
                                        }
                                </tbody>
                            </table>
                            <!-- Pagination -->
                            @if (totalPages() > 1 || totalItems() > 0) {
                                <div class="flex items-center justify-between px-2 py-2.5 border-t border-[rgb(var(--color-border-base))] bg-[rgb(var(--color-surface-muted))]">
                                    <div class="text-xs text-[rgb(var(--color-text-muted))]">
                                        {{ pageStartIndex() }}–{{ pageEndIndex() }} of {{ totalItems() }}
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <!-- Rows per page selector -->
                                        <div class="flex items-center gap-1.5">
                                            <label class="text-xs text-[rgb(var(--color-text-muted))]">Rows:</label>
                                            <select
                                                (change)="onPageSizeChange($event)"
                                                class="px-2 py-1 rounded text-xs bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] border border-[rgb(var(--color-border-muted))] focus:outline-none focus:border-[rgb(var(--color-accent-ring))] cursor-pointer hover:bg-[rgb(var(--color-surface-hover))] transition-colors"
                                            >
                                                @for (s of pageSizes; track s) {
                                                    <option [value]="s" [selected]="perPage() === s">{{ s }}</option>
                                                }
                                            </select>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <button
                                                (click)="onPrevPage()"
                                                [disabled]="currentPage() === 0"
                                                class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                                [class]="currentPage() === 0
                                                    ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-muted))] opacity-50 cursor-not-allowed'
                                                    : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))]'"
                                            >
                                                ← Previous
                                            </button>
                                            <span class="text-xs text-[rgb(var(--color-text-muted))] font-medium flex items-center gap-1">
                                                <span>Page</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    [max]="totalPages()"
                                                    [value]="currentPage() + 1"
                                                    (keydown.enter)="goToPage($event)"
                                                    (blur)="goToPage($event)"
                                                    class="w-10 px-1 py-0.5 text-center text-xs bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] border border-[rgb(var(--color-border-muted))] rounded focus:outline-none focus:border-[rgb(var(--color-accent-ring))]"
                                                >
                                                <span>of {{ totalPages() }}</span>
                                            </span>
                                            <button
                                                (click)="onNextPage()"
                                                [disabled]="currentPage() >= totalPages() - 1"
                                                class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                                [class]="currentPage() >= totalPages() - 1
                                                    ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-muted))] opacity-50 cursor-not-allowed'
                                                    : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))]'"
                                            >
                                                Next →
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            }
                        </div>
                    </div>
                }
                @case ('categories') {
                        <app-categories-view
                            [items]="lookupData()"
                            [filteredType]="filteredCategoryType()"
                            (onEdit)="onCategoriesEdit($event)"
                            (onDelete)="onCategoriesDelete($event)"
                        ></app-categories-view>
                    }
                    @case ('framework-languages') {
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
                    @case ('systems') {
                        <div class="flex flex-col h-full">
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
                                            <th (click)="onSort('description')" class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                                                <div class="flex items-center">
                                                    Description
                                                    @if (sortState().column === 'description') {
                                                        <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                                    }
                                                </div>
                                            </th>
                                            <th class="p-2 font-semibold text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @for (s of rawSystems(); track s.id) {
                                            <tr 
                                                tabindex="0"
                                                (dblclick)="onEdit(s)"
                                                (keydown.enter)="onEdit(s)"
                                                class="border-b border-[rgb(var(--color-border-base))] hover:bg-[rgb(var(--color-surface-hover))] cursor-pointer group focus:outline-none focus:bg-[rgb(var(--color-surface-hover))]"
                                            >
                                                <td class="p-2 py-1.5 text-[rgb(var(--color-text-base))] font-medium">{{ s.name }}</td>
                                                <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ s.type || '-' }}</td>
                                                <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))] text-sm max-w-md truncate">{{ s.description || '-' }}</td>
                                                <td class="p-2 py-1.5 text-right whitespace-nowrap">
                                                    <button (click)="onEdit(s)" class="text-[rgb(var(--color-accent-ring))] hover:underline mr-3 text-xs">Edit</button>
                                                    <button (click)="onDelete(s)" class="text-red-500 hover:underline text-xs">Delete</button>
                                                </td>
                                            </tr>
                                        } @empty {
                                            <tr>
                                                <td colspan="4" class="p-8 text-center text-[rgb(var(--color-text-muted))]">
                                                    No systems found.
                                                </td>
                                            </tr>
                                        }
                                    </tbody>
                                </table>
                                <!-- Pagination -->
                                @if (totalPages() > 1 || totalItems() > 0) {
                                    <div class="flex items-center justify-between px-2 py-2.5 border-t border-[rgb(var(--color-border-base))] bg-[rgb(var(--color-surface-muted))]">
                                        <div class="text-xs text-[rgb(var(--color-text-muted))]">
                                            {{ pageStartIndex() }}–{{ pageEndIndex() }} of {{ totalItems() }}
                                        </div>
                                        <div class="flex items-center gap-3">
                                            <div class="flex items-center gap-1.5">
                                                <label class="text-xs text-[rgb(var(--color-text-muted))]">Rows:</label>
                                                <select
                                                    (change)="onPageSizeChange($event)"
                                                    class="px-2 py-1 rounded text-xs bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] border border-[rgb(var(--color-border-muted))] focus:outline-none focus:border-[rgb(var(--color-accent-ring))] cursor-pointer hover:bg-[rgb(var(--color-surface-hover))] transition-colors"
                                                >
                                                    @for (s of pageSizes; track s) {
                                                        <option [value]="s" [selected]="perPage() === s">{{ s }}</option>
                                                    }
                                                </select>
                                            </div>
                                            <div class="flex items-center gap-2">
                                                <button
                                                    (click)="onPrevPage()"
                                                    [disabled]="currentPage() === 0"
                                                    class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                                    [class]="currentPage() === 0
                                                        ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-muted))] opacity-50 cursor-not-allowed'
                                                        : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))]'"
                                                >
                                                    ← Previous
                                                </button>
                                                <span class="text-xs text-[rgb(var(--color-text-muted))] font-medium flex items-center gap-1">
                                                    <span>Page</span>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        [max]="totalPages()"
                                                        [value]="currentPage() + 1"
                                                        (keydown.enter)="goToPage($event)"
                                                        (blur)="goToPage($event)"
                                                        class="w-10 px-1 py-0.5 text-center text-xs bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] border border-[rgb(var(--color-border-muted))] rounded focus:outline-none focus:border-[rgb(var(--color-accent-ring))]"
                                                    >
                                                    <span>of {{ totalPages() }}</span>
                                                </span>
                                                <button
                                                    (click)="onNextPage()"
                                                    [disabled]="currentPage() >= totalPages() - 1"
                                                    class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                                    [class]="currentPage() >= totalPages() - 1
                                                        ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-muted))] opacity-50 cursor-not-allowed'
                                                        : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))]'"
                                                >
                                                    Next →
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                }
                            </div>
                        </div>
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
            [type]="editLookupType()"
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

        @if (isSystemDialogOpen()) {
            <app-upsert-system-dialog
                [baseUrl]="baseUrl()"
                [system]="selectedSystemForEdit()"
                (saved)="onSystemSaved()"
                (cancelled)="onSystemDialogClose()"
            ></app-upsert-system-dialog>
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
    private serviceMeshService = inject(ServiceMeshService);
    private componentRegistry = inject(ComponentRegistryService);

    // Data Signals
    // Data Signals (Raw)
    private rawServices = signal<ServiceInstance[]>([]);
    private rawFrameworks = signal<Framework[]>([]);
    private rawDeployments = signal<Deployment[]>([]);
    private rawServers = signal<Server[]>([]);
    private rawLibraries = signal<Library[]>([]);
    private rawSystems = signal<SystemItem[]>([]);

    loading = signal(false);
    error = signal<string | null>(null);

    // Sort State
    sortState = signal<{ column: string; direction: 'asc' | 'desc' }>({ column: 'name', direction: 'asc' });

    // Pagination State
    currentPage = signal(0);
    totalPages = signal(0);
    totalItems = signal(0);
    perPage = signal(100);
    readonly pageSizes = [25, 50, 100];

    // Computed pagination display helpers
    pageStartIndex = computed(() => this.currentPage() * this.perPage() + 1);
    pageEndIndex = computed(() => Math.min((this.currentPage() + 1) * this.perPage(), this.totalItems()));

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

    systems = computed(() => {
        return this.sortData(this.rawSystems(), this.sortState(), (item, col) => {
            switch (col) {
                case 'name': return item.name;
                case 'type': return item.type;
                case 'description': return item.description;
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
    selectedServerForEdit = signal<Server | null>(null);

    // Lookup State
    lookupData = signal<LookupItem[]>([]);
    isLookupDialogOpen = signal(false);
    selectedLookupForEdit = signal<LookupItem | null>(null);

    /** Override type for the upsert-lookup-dialog when editing from the unified categories view. */
    private _categoriesEditType = signal<string | null>(null);

    /**
     * The effective lookup type to pass to the upsert-lookup-dialog.
     * Normally {@link managementType}, but overridden to the specific
     * endpoint type (e.g. 'framework-categories') when editing from
     * the unified categories view.
     */
    editLookupType = computed(() => this._categoriesEditType() ?? this.managementType());

    /**
     * Display type for the template switch — normalizes {@code categories:*} to {@code categories}
     * so child nodes under Categories render the same categories view.
     */
    displayType = computed(() => {
        const t = this.managementType();
        if (t.startsWith('categories:')) return 'categories';
        return t;
    });

    /**
     * When managementType is {@code categories:{discriminator}}, extracts the discriminator
     * (e.g. {@code framework_type}). Returns null otherwise.
     */
    filteredCategoryType = computed<string | null>(() => {
        const t = this.managementType();
        if (t.startsWith('categories:')) {
            return t.slice('categories:'.length);
        }
        return null;
    });

    // Library Dialog State
    isLibraryDialogOpen = signal(false);
    selectedLibraryForEdit = signal<Library | null>(null);

    isSystemDialogOpen = signal(false);
    selectedSystemForEdit = signal<SystemItem | null>(null);

    // Service Libraries Dialog State (removed - service_libraries table dropped)

    // Tab State for Generic Service View
    activeTab = signal<string>('services');

    private componentStartTime = Date.now();

    constructor() {
        effect(() => {
            // Reset active tab when management type changes
            // Normalize categories:* to just 'categories' for the tab check
            const type = this.managementType();
            const displayType = type.startsWith('categories:') ? 'categories' : type;
            if (displayType) {
                this.activeTab.set(displayType === 'services' ? 'services' : displayType);
                // Reset sort + page on type change
                this.sortState.set({ column: 'name', direction: 'asc' });
                this.currentPage.set(0);
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

            // Normalize categories:* for display in status bar
            const statusType = type.startsWith('categories:') ? 'categories' : type;

            switch (statusType) {
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
                case 'categories':
                case 'framework-languages':
                case 'operating-systems':
                case 'environments':
                    count = this.lookupData().length;
                    displayType = type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    break;
                case 'systems':
                    count = this.systems().length;
                    displayType = 'Systems';
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
        // Normalize categories:* to categories for data loading
        const normalizedType = type.startsWith('categories:') ? 'categories' : type;
        const actualType = (normalizedType === 'services' && activeTab !== 'services') ? activeTab : normalizedType;
        const page = this.currentPage();
        const size = this.perPage();

        try {
            switch (actualType) {
                case 'services':
                    console.log('[PlatformManagement] Fetching services from', `${url}/api/v1/services?page=${page}&size=${size}`);
                    const sResp = await this.platformService.getServices(url, page, size);
                    console.log('[PlatformManagement] Services loaded', sResp.data.length, 'of', sResp.meta.total);
                    this.rawServices.set(sResp.data);
                    this.totalPages.set(sResp.meta.last_page);
                    this.totalItems.set(sResp.meta.total);
                    this.perPage.set(sResp.meta.per_page);
                    break;
                case 'frameworks':
                    const fResp = await this.platformService.getFrameworks(url, page, size);
                    this.rawFrameworks.set(fResp.data);
                    this.totalPages.set(fResp.meta.last_page);
                    this.totalItems.set(fResp.meta.total);
                    this.perPage.set(fResp.meta.per_page);
                    break;
                case 'deployments':
                    const dResp = await this.platformService.getDeployments(url, page, size);
                    this.rawDeployments.set(dResp.data);
                    this.totalPages.set(dResp.meta.last_page);
                    this.totalItems.set(dResp.meta.total);
                    this.perPage.set(dResp.meta.per_page);
                    break;
                case 'servers':
                    const hResp = await this.platformService.getServers(url, page, size);
                    this.rawServers.set(hResp.data);
                    this.totalPages.set(hResp.meta.last_page);
                    this.totalItems.set(hResp.meta.total);
                    this.perPage.set(hResp.meta.per_page);
                    break;
                case 'categories':
                case 'framework-languages':
                case 'operating-systems':
                case 'environments':
                    const lResp = await this.platformService.getLookup(url, actualType, page, size);
                    this.lookupData.set(lResp.data);
                    this.totalPages.set(lResp.meta.last_page);
                    this.totalItems.set(lResp.meta.total);
                    this.perPage.set(lResp.meta.per_page);
                    break;
                case 'libraries':
                    const libsResp = await this.platformService.getLibraries(url, page, size);
                    this.rawLibraries.set(libsResp.data);
                    this.totalPages.set(libsResp.meta.last_page);
                    this.totalItems.set(libsResp.meta.total);
                    this.perPage.set(libsResp.meta.per_page);
                    break;
                case 'systems':
                    const sysResp = await this.platformService.getSystems(url, page, size);
                    this.rawSystems.set(sysResp.data);
                    this.totalPages.set(sysResp.meta.last_page);
                    this.totalItems.set(sysResp.meta.total);
                    this.perPage.set(sysResp.meta.per_page);
                    break;
            }
        } catch (e) {
            console.error('Error loading data', e);
            this.error.set(`Failed to load ${actualType}`);
        } finally {
            this.loading.set(false);
        }
    }

    onPrevPage() {
        if (this.currentPage() > 0) {
            this.currentPage.update(p => p - 1);
        }
    }

    onNextPage() {
        if (this.currentPage() < this.totalPages() - 1) {
            this.currentPage.update(p => p + 1);
        }
    }

    onPageSizeChange(event: Event) {
        const size = Number((event.target as HTMLSelectElement).value);
        this.perPage.set(size);
        this.currentPage.set(0);
    }

    goToPage(event: Event) {
        const input = event.target as HTMLInputElement;
        const page = parseInt(input.value, 10);
        if (isNaN(page) || page < 1 || page > this.totalPages()) {
            input.value = String(this.currentPage() + 1);
            return;
        }
        this.currentPage.set(page - 1);
    }

    onAdd() {
        const type = this.managementType();
        const currentTab = this.activeTab();
        const actualType = (type === 'services' && currentTab !== 'services') ? currentTab : type;

        // Handle categories with filter — open lookup dialog with the specific endpoint type
        if (actualType.startsWith('categories:')) {
            const filterType = actualType.slice('categories:'.length);
            const endpointType = getCategoryEndpointType(filterType);
            this._categoriesEditType.set(endpointType);
            this.selectedLookupForEdit.set(null);
            this.isLookupDialogOpen.set(true);
            return;
        }

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
            case 'framework-languages':
            case 'operating-systems':
            case 'environments':
                this.selectedLookupForEdit.set(null);
                this.isLookupDialogOpen.set(true);
                break;                case 'libraries':
                    this.selectedLibraryForEdit.set(null);
                    this.isLibraryDialogOpen.set(true);
                    break;
                case 'systems':
                    this.selectedSystemForEdit.set(null);
                    this.isSystemDialogOpen.set(true);
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
            case 'framework-languages':
            case 'operating-systems':
            case 'environments':
                this.selectedLookupForEdit.set(item);
                this.isLookupDialogOpen.set(true);
                break;
            case 'libraries':
                this.selectedLibraryForEdit.set(item);
                this.isLibraryDialogOpen.set(true);
                break;
            case 'systems':
                this.selectedSystemForEdit.set(item);
                this.isSystemDialogOpen.set(true);
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
                case 'framework-languages':
                case 'operating-systems':
                case 'environments':
                    await this.platformService.deleteLookup(url, actualType, Number(item.id));
                    break;
                case 'libraries':
                    await this.platformService.deleteLibrary(url, Number(item.id));
                    break;
                case 'systems':
                    await this.platformService.deleteSystem(url, Number(item.id));
                    break;
            }
            this.loadData(); // Refresh
            this.serviceMeshService.fetchAllData();
            if (actualType === 'service-types') {
                this.componentRegistry.refresh();
            }
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
        this.serviceMeshService.fetchAllData();
    }

    // Framework Dialog Handlers
    onFrameworkDialogClose() {
        this.isFrameworkDialogOpen.set(false);
        this.selectedFrameworkForEdit.set(null);
    }

    onFrameworkSaved() {
        this.loadData();
        this.serviceMeshService.fetchAllData();
    }

    // Deployment Dialog Handlers
    onDeploymentDialogClose() {
        this.isDeploymentDialogOpen.set(false);
        this.selectedDeploymentForEdit.set(null);
    }

    onDeploymentSaved() {
        this.loadData();
        this.serviceMeshService.fetchAllData();
    }

    // Server Dialog Handlers
    onServerDialogClose() {
        this.isServerDialogOpen.set(false);
        this.selectedServerForEdit.set(null);
    }

    onServerSaved() {
        this.loadData();
        this.serviceMeshService.fetchAllData();
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

    // --- Categories View Handlers -----------------------------

    /**
     * Handle edit event from the unified categories view.
     * Overrides the dialog type to the specific endpoint type
     * (e.g. 'framework-categories', 'server-types') so that the
     * upsert dialog sends updates to the correct backend endpoint.
     */
    onCategoriesEdit(event: { item: LookupItem; type: string }) {
        this._categoriesEditType.set(event.type);
        this.selectedLookupForEdit.set(event.item);
        this.isLookupDialogOpen.set(true);
    }

    /** Handle delete event from the unified categories view. */
    async onCategoriesDelete(event: { item: LookupItem; type: string }) {
        if (!confirm('Are you sure you want to delete this item?')) return;
        const url = this.baseUrl();
        if (!url) return;
        try {
            await this.platformService.deleteLookup(url, event.type, Number(event.item.id));
            this.loadData();
            this.serviceMeshService.fetchAllData();
        } catch (e) {
            console.error('Delete failed', e);
            alert('Failed to delete item');
        }
    }

    // -----------------------------------------------------------

    // Lookup Dialog Handlers
    onLookupDialogClose() {
        this._categoriesEditType.set(null);
        this.isLookupDialogOpen.set(false);
        this.selectedLookupForEdit.set(null);
    }

    onLookupSaved() {
        this.loadData();
        this.serviceMeshService.fetchAllData();
        // Visual components (Default Visual Style) may have changed for service-types
        if (this.managementType() === 'service-types') {
            this.componentRegistry.refresh();
        }
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

    // System Dialog Handlers

    onSystemDialogClose() {
        this.isSystemDialogOpen.set(false);
        this.selectedSystemForEdit.set(null);
    }

    onSystemSaved() {
        this.loadData();
        this.serviceMeshService.fetchAllData();
    }

}

