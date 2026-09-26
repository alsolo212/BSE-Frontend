import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { apiConfig } from '../config/api.config';
import {
  AuthResponse,
  AuthUserSummary,
  LoginRequest,
  RegisterRequest,
  StoredAuthSession
} from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly sessionStorageKey = 'bse.auth.session';
  private readonly session = signal<StoredAuthSession | null>(this.readSession());

  readonly currentUser = computed(() => this.session()?.user ?? null);
  readonly isAdmin = computed(() => {
    const roles = this.currentUser()?.roles ?? [];
    return roles.includes('Admin') || roles.includes('SuperAdmin');
  });
  readonly isSuperAdmin = computed(() => this.currentUser()?.roles.includes('SuperAdmin') ?? false);
  readonly isAuthenticated = computed(() => {
    const currentSession = this.session();
    if (!currentSession) {
      return false;
    }

    return new Date(currentSession.expiresAtUtc).getTime() > Date.now();
  });

  constructor() {
    if (this.session() && !this.isAuthenticated()) {
      this.clearSession();
    }
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${apiConfig.baseUrl}/auth/login`, request)
      .pipe(tap(response => this.persistSession(response)));
  }

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${apiConfig.baseUrl}/auth/register`, request)
      .pipe(tap(response => this.persistSession(response)));
  }

  loadCurrentUser(): Observable<AuthUserSummary> {
    return this.http
      .get<AuthUserSummary>(`${apiConfig.baseUrl}/auth/me`)
      .pipe(tap(user => this.patchUser(user)));
  }

  logout(): void {
    this.clearSession();
  }

  getAccessToken(): string | null {
    if (!this.isAuthenticated()) {
      return null;
    }

    return this.session()?.accessToken ?? null;
  }

  updateCurrentUser(user: Partial<AuthUserSummary>): void {
    const currentSession = this.session();
    if (!currentSession) {
      return;
    }

    const nextSession: StoredAuthSession = {
      ...currentSession,
      user: {
        ...currentSession.user,
        ...user
      }
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
  }

  private patchUser(user: AuthUserSummary): void {
    const currentSession = this.session();
    if (!currentSession) {
      return;
    }

    const nextSession: StoredAuthSession = {
      ...currentSession,
      user
    };

    this.session.set(nextSession);
    this.writeSession(nextSession);
  }

  private readSession(): StoredAuthSession | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const rawValue = window.localStorage.getItem(this.sessionStorageKey);
    if (!rawValue) {
      return null;
    }

    try {
      return JSON.parse(rawValue) as StoredAuthSession;
    } catch {
      window.localStorage.removeItem(this.sessionStorageKey);
      return null;
    }
  }

  private writeSession(session: StoredAuthSession): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(this.sessionStorageKey, JSON.stringify(session));
  }

  private clearSession(): void {
    this.session.set(null);

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(this.sessionStorageKey);
    }
  }
}
