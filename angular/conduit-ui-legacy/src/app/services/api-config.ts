import { InjectionToken, Provider } from '@angular/core';

/** Injection token for the MCP server API base URL */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');

/** Provider factory for API_BASE_URL */
export function provideApiBaseUrl(url: string): Provider {
  return { provide: API_BASE_URL, useValue: url };
}
