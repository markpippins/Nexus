import { HttpContextToken } from '@angular/common/http';

/**
 * Set to true on HTTP requests that should NOT trigger the global error banner
 * when they fail. Use for best-effort calls where the component already handles
 * errors gracefully (health probes, optional config fetches, etc.).
 */
export const SILENT_REQUEST = new HttpContextToken<boolean>(() => false);
