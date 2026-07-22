/** Sort direction */
export type SortDir = 'asc' | 'desc';

/**
 * Sorts an array of items by a named field. Handles strings (case-insensitive),
 * numbers, and dates (ISO strings). Null/undefined values sort to the end.
 * Returns a new array — does not mutate the original.
 */
export function sortItems<T>(
  items: T[],
  field: string,
  dir: SortDir,
): T[] {
  if (!field) return items;

  return [...items].sort((a, b) => {
    const valA = (a as Record<string, unknown>)[field];
    const valB = (b as Record<string, unknown>)[field];

    // Nulls/undefined sort to end regardless of direction
    if (valA == null && valB == null) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;

    let cmp: number;

    if (typeof valA === 'number' && typeof valB === 'number') {
      cmp = valA - valB;
    } else if (typeof valA === 'string' && typeof valB === 'string') {
      // ISO date strings can be compared directly as strings
      cmp = valA.toLowerCase().localeCompare(valB.toLowerCase());
    } else {
      cmp = String(valA).toLowerCase().localeCompare(String(valB).toLowerCase());
    }

    return dir === 'asc' ? cmp : -cmp;
  });
}

/**
 * Toggles sort field/direction. If the same field is clicked, flips direction.
 * If a new field is clicked, starts ascending.
 */
export function toggleSort(
  currentField: string,
  currentDir: SortDir,
  clickedField: string,
): { field: string; dir: SortDir } {
  if (currentField === clickedField) {
    return { field: clickedField, dir: currentDir === 'asc' ? 'desc' : 'asc' };
  }
  return { field: clickedField, dir: 'asc' };
}
