import '@angular/compiler';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';

import { AppComponent } from './app.component';
import { IS_DEBUG_MODE } from './services/app-config';

// We assume the build process exposes DEBUG from .env as process.env.DEBUG

declare const process: any;
const isDebugMode = false;

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(withFetch()),
    provideAnimations(),
    { provide: IS_DEBUG_MODE, useValue: isDebugMode },
  ],
}).catch((err) => console.error(err));

// AI Studio always uses an `index.tsx` file for all project types.