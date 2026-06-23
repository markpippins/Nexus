import { HttpInterceptorFn, HttpErrorResponse, HttpContext } from '@angular/common/http';
import { inject } from '@angular/core';
import { GlobalErrorService } from '../services/global-error.service';
import { SILENT_REQUEST } from './request-context';
import { catchError, retry, timeout, throwError } from 'rxjs';

export const ErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const globalError = inject(GlobalErrorService);

  return next(req).pipe(
    timeout(15000),
    retry({
      count: 1,
      delay: 1000,
    }),
    catchError((error: HttpErrorResponse) => {
      // Suppress global error banner for best-effort / silent requests.
      // Components that use SILENT_REQUEST context handle their own errors.
      if (req.context.get(SILENT_REQUEST)) {
        return throwError(() => error);
      }

      let message = 'An unknown error occurred';

      if (error.error instanceof ErrorEvent) {
        // Client-side / network error
        message = `Network error: ${error.error.message}`;
      } else {
        // Server-side error
        const serverMsg = error.error?.error?.message || error.message;
        message = `Server error (${error.status}): ${serverMsg}`;
      }

      globalError.show(message);

      // Re-throw so component-level handlers can still respond
      return throwError(() => error);
    }),
  );
};
