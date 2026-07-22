import { ActivatedRoute, Router } from '@angular/router';

/**
 * Read sort state from URL query params on initial load.
 * Falls back to defaults if params are not present.
 */
export function readSortFromSnapshot(
  route: ActivatedRoute,
  defaultField: string,
  defaultDir: 'asc' | 'desc'
): { field: string; dir: 'asc' | 'desc' } {
  const params = route.snapshot.queryParams;
  const field = (params['sort'] as string) || defaultField;
  const dir = (params['dir'] as 'asc' | 'desc') || defaultDir;
  return { field, dir };
}

/**
 * Write sort state to URL query params so it persists across navigation.
 * Omits params when sort is cleared (field is empty).
 */
export function writeSortToQueryParams(
  router: Router,
  route: ActivatedRoute,
  field: string,
  dir: 'asc' | 'desc'
): void {
  router.navigate([], {
    relativeTo: route,
    queryParams: {
      sort: field || null,
      dir: field ? dir : null,
    },
    queryParamsHandling: 'merge',
  });
}
