export interface BseRuntimeConfig {
  apiOrigin?: string;
  apiBaseUrl?: string;
  googleClientId?: string;
}

declare global {
  interface Window {
    __BSE_CONFIG__?: BseRuntimeConfig;
  }
}

const runtimeConfig: BseRuntimeConfig =
  typeof window === 'undefined' ? {} : window.__BSE_CONFIG__ ?? {};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');
const managedAvatarPathPrefix = '/uploads/avatars/';
const configuredBaseUrl = runtimeConfig.apiBaseUrl?.trim() ?? '';
const inferredOrigin = configuredBaseUrl.startsWith('http://') || configuredBaseUrl.startsWith('https://')
  ? new URL(configuredBaseUrl).origin
  : '';
const configuredOrigin = trimTrailingSlash(runtimeConfig.apiOrigin?.trim() || inferredOrigin);

export const apiConfig = {
  origin: configuredOrigin,
  baseUrl: trimTrailingSlash(configuredBaseUrl || (configuredOrigin ? `${configuredOrigin}/api` : '/api')),
  googleClientId: runtimeConfig.googleClientId?.trim() ?? ''
};

export function isApiUrl(url: string): boolean {
  if (url.startsWith(apiConfig.baseUrl)) {
    return true;
  }

  return Boolean(apiConfig.origin) && url.startsWith(`${apiConfig.origin}/`);
}

export function resolveApiUrl(path?: string | null): string | null {
  if (!path) {
    return null;
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  if (path.startsWith(managedAvatarPathPrefix)) {
    const fileName = path.slice(managedAvatarPathPrefix.length);
    return `${apiConfig.origin}/api/users/avatar/${encodeURIComponent(fileName)}`;
  }

  if (path.startsWith('/')) {
    return `${apiConfig.origin}${path}`;
  }

  return `${apiConfig.origin}/${path}`;
}
