import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { apiConfig } from '../config/api.config';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const accessToken = authService.getAccessToken();
  const isApiRequest = request.url.startsWith(apiConfig.origin);

  const authorizedRequest = accessToken && isApiRequest
    ? request.clone({
        setHeaders: {
          Authorization: `Bearer ${accessToken}`
        }
      })
    : request;

  return next(authorizedRequest).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !authorizedRequest.url.endsWith('/auth/login') &&
        !authorizedRequest.url.endsWith('/auth/register')
      ) {
        authService.logout();
        void router.navigateByUrl('/auth');
      }

      return throwError(() => error);
    })
  );
};
