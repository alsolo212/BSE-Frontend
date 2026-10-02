export interface AuthUserSummary {
  id: string;
  userName: string;
  email: string;
  roles: string[];
  profileImageUrl?: string | null;
  hasPassword?: boolean;
}

export interface AuthResponse {
  accessToken: string;
  expiresAtUtc: string;
  user: AuthUserSummary;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  userName: string;
  email: string;
  phone?: string | null;
  password: string;
  confirmPassword: string;
}

export interface GoogleLoginRequest {
  idToken: string;
}

export interface SetPasswordRequest {
  newPassword: string;
  confirmPassword: string;
}

export interface StoredAuthSession {
  accessToken: string;
  expiresAtUtc: string;
  user: AuthUserSummary;
}
