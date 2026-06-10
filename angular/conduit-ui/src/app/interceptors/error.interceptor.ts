import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { GlobalErrorService } from '../services/global-error.service';
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
