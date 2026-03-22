import { Component, ChangeDetectionStrategy, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LookupItem } from '../../../services/platform-management.service.js';

@Component({
  selector: 'app-lookup-list',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overflow-x-auto">
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
          @for (item of sortedItems(); track item.id) {
            <tr tabindex="0" (dblclick)="onEdit.emit(item)" (keydown.enter)="onEdit.emit(item)" class="border-b border-[rgb(var(--color-border-base))] hover:bg-[rgb(var(--color-surface-hover))] cursor-pointer group focus:outline-none focus:bg-[rgb(var(--color-surface-hover))]">
              <td class="p-2 py-1.5 text-[rgb(var(--color-text-base))] font-medium">{{ item.name }}</td>
              <td class="p-2 py-1.5 text-[rgb(var(--color-text-muted))]">{{ item.description || '-' }}</td>
              <td class="p-2 py-1.5 text-right whitespace-nowrap">
                <button (click)="onEdit.emit(item)" class="text-[rgb(var(--color-accent-ring))] hover:underline mr-3 text-xs">Edit</button>
                <button (click)="onDelete.emit(item)" class="text-red-500 hover:underline text-xs">Delete</button>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="3" class="p-8 text-center text-[rgb(var(--color-text-muted))]">
                No {{ type() | lowercase | replace:'-':' ' }} found.
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `
})
export class LookupListComponent {
  items = input<LookupItem[]>([]);
  type = input.required<string>();

  onEdit = output<LookupItem>();
  onDelete = output<LookupItem>();

  sortState = signal<{ column: string; direction: 'asc' | 'desc' }>({ column: 'name', direction: 'asc' });

  sortedItems = computed(() => {
    const currentSort = this.sortState();
    const data = this.items() ?? [];

    if (!currentSort.column) return data;

    return [...data].sort((a, b) => {
      const valA = (a as any)[currentSort.column] || '';
      const valB = (b as any)[currentSort.column] || '';

      if (valA === valB) return 0;

      const comparison = valA < valB ? -1 : 1;
      return currentSort.direction === 'asc' ? comparison : -comparison;
    });
  });

  onSort(column: string) {
    this.sortState.update(current => ({
      column,
      direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  }
}
