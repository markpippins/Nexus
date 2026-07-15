import { Component, ChangeDetectionStrategy, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LookupItem, TYPE_LABELS, FILTER_TYPES, getCategoryEndpointType } from '../../../services/platform-management.service.js';

@Component({
    selector: 'app-categories-view',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-col h-full">
        <!-- Type Filter Toolbar (hidden when filteredType is provided) -->
        @if (!hideFilterBar()) {
            <div class="flex flex-wrap gap-2 mb-4 pb-3 border-b border-[rgb(var(--color-border-base))]">
                @for (t of filterTypes; track t) {
                    <button
                        (click)="selectedType.set(t)"
                        class="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150"
                        [class]="selectedType() === t
                            ? 'bg-[rgb(var(--color-accent-ring))] text-white shadow-sm'
                            : 'bg-[rgb(var(--color-surface-muted))] text-[rgb(var(--color-text-muted))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border-muted))]'"
                    >
                        {{ typeLabels[t] }}
                        <span class="ml-1.5 opacity-70">
                            ({{ t === 'all' ? totalCount() : typeCounts()[t] || 0 }})
                        </span>
                    </button>
                }
            </div>
        }

        <!-- Table -->
        <div class="overflow-x-auto flex-1">
            <table class="w-full text-left border-collapse">
                <thead class="bg-[rgb(var(--color-surface-muted))] text-xs text-[rgb(var(--color-text-muted))] uppercase sticky top-0 z-10">
                    <tr>
                        <th (click)="onSort('name')" class="p-2 font-semibold w-1/4 cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]">
                            <div class="flex items-center">
                                Name
                                @if (sortState().column === 'name') {
                                    <span class="ml-1">{{ sortState().direction === 'asc' ? '↑' : '↓' }}</span>
                                }
                            </div>
                        </th>
                        <th class="p-2 font-semibold cursor-pointer hover:bg-[rgb(var(--color-surface-hover))]" (click)="onSort('type')">
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
                        <th class="p-2 font-semibold w-24 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    @for (item of filteredItems(); track item.id) {
                        <tr
                            tabindex="0"
                            (dblclick)="onEdit.emit({ item, type: getEndpointType(item.type || '') })"
                            (keydown.enter)="onEdit.emit({ item, type: getEndpointType(item.type || '') })"
                            class="border-b border-[rgb(var(--color-border-base))] hover:bg-[rgb(var(--color-surface-hover))] cursor-pointer group focus:outline-none focus:bg-[rgb(var(--color-surface-hover))]"
                        >
                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-base))] font-medium">{{ item.name }}</td>
                            <td class="p-2 py-1.5">
                                <span class="px-2 py-0.5 rounded text-xs font-medium"
                                    [class]="getTypeBadgeClass(item.type || '')"
                                >{{ typeLabels[item.type || ''] || item.type }}</span>
                            </td>
                            <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))] text-sm max-w-md truncate">{{ item.description || '-' }}</td>
                            <td class="p-2 py-1.5 text-right whitespace-nowrap">
                                <button
                                    (click)="onEdit.emit({ item, type: getEndpointType(item.type || '') })"
                                    class="text-[rgb(var(--color-accent-ring))] hover:underline mr-3 text-xs"
                                >Edit</button>
                                <button
                                    (click)="onDelete.emit({ item, type: getEndpointType(item.type || '') })"
                                    class="text-red-500 hover:underline text-xs"
                                >Delete</button>
                            </td>
                        </tr>
                    } @empty {
                        <tr>
                            <td colspan="4" class="p-8 text-center text-[rgb(var(--color-text-muted))]">
                                @if (effectiveType() === 'all') {
                                    No categories found.
                                } @else {
                                    No {{ typeLabels[effectiveType()] || effectiveType() }} categories found.
                                }
                            </td>
                        </tr>
                    }
                </tbody>
            </table>
        </div>
    </div>
  `
})
export class CategoriesViewComponent {
    items = input<LookupItem[]>([]);
    type = input<string>('categories');
    /** When set, auto-filters to this type and hides the type filter toolbar. */
    filteredType = input<string | null>(null);

    /** Emits { item, type } where `type` is the endpoint string for the dialog. */
    onEdit = output<{ item: LookupItem; type: string }>();
    /** Emits { item, type } where `type` is the endpoint string for deletion. */
    onDelete = output<{ item: LookupItem; type: string }>();

    /** Available filter types (excludes service_config_type from filter for simplicity). */
    filterTypes = FILTER_TYPES;
    typeLabels = TYPE_LABELS;

    /** Whether to hide the filter toolbar — true when a filteredType is provided. */
    hideFilterBar = computed(() => this.filteredType() !== null);

    /** The effective selected type: uses filteredType when provided, otherwise the user's selected type. */
    effectiveType = computed(() => this.filteredType() ?? this.selectedType());

    selectedType = signal<string>('all');
    sortState = signal<{ column: string; direction: 'asc' | 'desc' }>({ column: 'name', direction: 'asc' });

    /** Count of items per type. */
    typeCounts = computed(() => {
        const counts: Record<string, number> = {};
        for (const item of this.items()) {
            const t = item.type || 'unknown';
            counts[t] = (counts[t] || 0) + 1;
        }
        return counts;
    });

    /** Total count of all items. */
    totalCount = computed(() => this.items().length);

    /** Items filtered by selected type and sorted. */
    filteredItems = computed(() => {
        let data = this.items();

        // Filter by type — use effectiveType (respects filteredType override)
        const sel = this.effectiveType();
        if (sel !== 'all') {
            data = data.filter(item => item.type === sel);
        }

        // Sort
        const sort = this.sortState();
        if (!sort.column) return data;

        return [...data].sort((a, b) => {
            const valA = (a as any)[sort.column] || '';
            const valB = (b as any)[sort.column] || '';
            if (valA === valB) return 0;
            const comparison = valA < valB ? -1 : 1;
            return sort.direction === 'asc' ? comparison : -comparison;
        });
    });

    /** Map a DB discriminator value to an endpoint type string. */
    getEndpointType(dbType: string): string {
        return getCategoryEndpointType(dbType);
    }

    /** Generate a color badge class based on the type discriminator. */
    getTypeBadgeClass(type: string): string {
        switch (type) {
            case 'framework_type': return 'bg-blue-500/10 text-blue-500';
            case 'server_type':    return 'bg-green-500/10 text-green-500';
            case 'library_type':   return 'bg-purple-500/10 text-purple-500';
            case 'environment_type': return 'bg-yellow-500/10 text-yellow-600';
            case 'service_type':   return 'bg-orange-500/10 text-orange-500';
            case 'service_config_type': return 'bg-pink-500/10 text-pink-500';
            case 'operating_systems': return 'bg-cyan-500/10 text-cyan-500';
            default:               return 'bg-gray-500/10 text-gray-500';
        }
    }

    onSort(column: string) {
        this.sortState.update(current => ({
            column,
            direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    }
}
