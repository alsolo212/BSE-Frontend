import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import {
  catchError,
  finalize,
  map,
  Observable,
  of,
  shareReplay,
  tap,
  throwError
} from 'rxjs';
import { apiConfig, resolveApiUrl } from '../config/api.config';
import {
  AuthResponse,
  AuthUserSummary,
  GoogleLoginRequest,
  LoginRequest,
  RegisterRequest,
  SetPasswordRequest,
  StoredAuthSession
} from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly sessionStorageKey = 'bse.auth.session';
  private readonly session = signal<StoredAuthSession | null>(this.readSession());
  private refreshInFlight$: Observable<AuthResponse> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  readonly currentUser = computed(() => this.session()?.user ?? null);
  readonly isAdmin = computed(() => {
    const roles = this.currentUser()?.roles ?? [];
    return roles.includes('Admin') || roles.includes('SuperAdmin');
  });
  readonly isSuperAdmin = computed(() => this.currentUser()?.roles.includes('SuperAdmin') ?? false);
  readonly isAuthenticated = computed(() => {
    const currentSession = this.session();
    return Boolean(
      currentSession?.accessToken &&
      new Date(currentSession.expiresAtUtc).getTime() > Date.now()
    );
  });

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${apiConfig.baseUrl}/auth/login`, request, { withCredentials: true })
      .pipe(tap(response => this.persistSession(response)));
  }

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${apiConfig.baseUrl}/auth/register`, request, { withCredentials: true })
      .pipe(tap(response => this.persistSession(response)));
  }

  loginWithGoogle(request: GoogleLoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${apiConfig.baseUrl}/auth/google`, request, { withCredentials: true })
      .pipe(tap(response => this.persistSession(response)));
  }

  getGoogleClientId(): Observable<string> {
    if (apiConfig.googleClientId) {
      return of(apiConfig.googleClientId);
    }

    return this.http
      .get<{ clientId?: string }>(`${apiConfig.baseUrl}/auth/google-config`)
      .pipe(
        map(response => response.clientId?.trim() ?? ''),
        catchError(() => of('')),
        shareReplay({ bufferSize: 1, refCount: false })
      );
  }

  refreshSession(): Observable<AuthResponse> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }

    this.refreshInFlight$ = this.http
      .post<AuthResponse>(`${apiConfig.baseUrl}/auth/refresh`, {}, { withCredentials: true })
      .pipe(
        tap(response => this.persistSession(response)),
        catchError(error => {
          this.clearSession();
          return throwError(() => error);
        }),
        finalize(() => {
          this.refreshInFlight$ = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );

    return this.refreshInFlight$;
  }

  restoreSession(): Observable<void> {
    return this.refreshSession().pipe(
      map(() => undefined),
      catchError(() => of(undefined))
    );
  }

  setPassword(request: SetPasswordRequest): Observable<AuthUserSummary> {
    return this.http
      .post<AuthUserSummary>(`${apiConfig.baseUrl}/auth/password`, request)
      .pipe(tap(user => this.patchUser(user)));
  }

  loadCurrentUser(): Observable<AuthUserSummary> {
    return this.http
      .get<AuthUserSummary>(`${apiConfig.baseUrl}/auth/me`)
      .pipe(tap(user => this.patchUser(user)));
  }

  logout(): void {
    this.http
      .post<void>(`${apiConfig.baseUrl}/auth/logout`, {}, { withCredentials: true })
      .subscribe({ error: () => undefined });
    this.clearSession();
  }

  clearSessionOnUnauthorized(): void {
    this.clearSession();
  }

  getAccessToken(): string | null {
    return this.isAuthenticated() ? this.session()?.accessToken ?? null : null;
  }

  updateCurrentUser(user: Partial<AuthUserSummary>): void {
    const currentSession = this.session();
    if (!currentSession) {
      return;
    }

    const nextSession: StoredAuthSession = {
      ...currentSession,
      user: { ...currentSession.user, ...user }
    };
    this.session.set(nextSession);
    this.writeSession(nextSession);
  }

  private persistSession(response: AuthResponse): void {
    const nextSession: StoredAuthSession = {
      accessToken: response.accessToken,
      expiresAtUtc: response.expiresAtUtc,
      user: response.user
    };

    this.session.set(nextSession);
    this.writeSession(nextSession);
    this.scheduleRefresh(nextSession.expiresAtUtc);
    this.preloadProfileImage(response.user.profileImageUrl);
  }

  private scheduleRefresh(expiresAtUtc: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }

    const refreshInMs = Math.max(
      30_000,
      new Date(expiresAtUtc).getTime() - Date.now() - 60_000
    );
    this.refreshTimer = window.setTimeout(() => {
      this.refreshSession().subscribe({ error: () => undefined });
    }, refreshInMs);
  }

  private preloadProfileImage(profileImageUrl?: string | null): void {
    if (!profileImageUrl || typeof window === 'undefined') {
      return;
    }

    const image = new Image();
    image.src = resolveApiUrl(profileImageUrl) ?? profileImageUrl;
  }

  private patchUser(user: AuthUserSummary): void {
    const currentSession = this.session();
    if (!currentSession) {
      return;
    }

    const nextSession: StoredAuthSession = { ...currentSession, user };
    this.session.set(nextSession);
    this.writeSession(nextSession);
  }

  private readSession(): StoredAuthSession | null {
    if (typeof window === 'undefined') {
      return null;
    }

    window.localStorage.removeItem(this.sessionStorageKey);
    const rawValue = window.sessionStorage.getItem(this.sessionStorageKey);
    if (!rawValue) {
      return null;
    }

    try {
      const persisted = JSON.parse(rawValue) as Omit<StoredAuthSession, 'accessToken'>;
      if (!persisted.user || !persisted.expiresAtUtc) {
        throw new Error('Invalid persisted session');
      }

      return { ...persisted, accessToken: '' };
    } catch {
      window.sessionStorage.removeItem(this.sessionStorageKey);
      return null;
    }
  }

  private writeSession(session: StoredAuthSession): void {
    if (typeof window !== 'undefined') {
      const { accessToken: _accessToken, ...persisted } = session;
      window.sessionStorage.setItem(this.sessionStorageKey, JSON.stringify(persisted));
    }
  }

  private clearSession(): void {
    this.session.set(null);
    if (this.refreshTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(this.sessionStorageKey);
    }
  }
}
