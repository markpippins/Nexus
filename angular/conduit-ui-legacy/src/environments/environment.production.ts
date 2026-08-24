export const environment = {
  production: true,
  // Production: served from conduit-ui-legacy:4201.  Backend is the
  // canonical conduit REST service.  If proxied behind nginx the same-
  // origin default works; set __CONDUIT_API_BASE_URL__ to override.
  apiBaseUrl:
    (typeof window !== 'undefined' && (window as any).__CONDUIT_API_BASE_URL__)
    || '',
};
