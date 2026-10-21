import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { isApiUrl } from '../config/api.config';
import { AuthService } from './auth.service';

export const skipAuthRefresh = new HttpContextToken<boolean>(() => false);

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const isApiRequest = isApiUrl(request.url);
  const accessToken = authService.getAccessToken();
  const authorizedRequest = isApiRequest
    ? request.clone({
        withCredentials: true,
        setHeaders: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
      })
    : request;

  return next(authorizedRequest).pipe(
    catchError((error: unknown) => {
      if (!shouldRefresh(error, authorizedRequest)) {
        return throwError(() => error);
      }

      return authService.refreshSession().pipe(
        switchMap(response =>
          next(
            authorizedRequest.clone({
              context: authorizedRequest.context.set(skipAuthRefresh, true),
              setHeaders: { Authorization: `Bearer ${response.accessToken}` }
            })
          )
        ),
        catchError(refreshError => {
          authService.logout();
          void router.navigateByUrl('/auth');
          return throwError(() => refreshError);
        })
      );
    })
  );
};

function shouldRefresh(error: unknown, request: Parameters<HttpInterceptorFn>[0]): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
    return false;
  }

  if (
    !isApiUrl(request.url) ||
    request.context.get(skipAuthRefresh) ||
    request.url.endsWith('/auth/login') ||
    request.url.endsWith('/auth/register') ||
    request.url.endsWith('/auth/google') ||
    request.url.endsWith('/auth/refresh') ||
    request.url.endsWith('/auth/logout')
  ) {
    return false;
  }

  return true;
}
