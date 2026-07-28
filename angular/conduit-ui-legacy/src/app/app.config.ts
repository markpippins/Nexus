import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withHashLocation } from '@angular/router';
import { routes } from './app.routes';
import { provideApiBaseUrl } from './services/api-config';
import { environment } from '../environments/environment';
import { ErrorInterceptor } from './interceptors/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptors([ErrorInterceptor])),
    provideAnimations(),
    provideRouter(routes, withHashLocation()),
    provideApiBaseUrl(environment.apiBaseUrl),
  ],
};
