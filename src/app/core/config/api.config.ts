export const apiConfig = {
  origin: 'http://localhost:5000',
  baseUrl: 'http://localhost:5000/api',
  googleClientId: '362105832578-fcm88p24sptt55v8nhkum84ujbfjg8lq.apps.googleusercontent.com'
};

export function resolveApiUrl(path?: string | null): string | null {
  if (!path) {
    return null;
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  if (path.startsWith('/')) {
    return `${apiConfig.origin}${path}`;
  }

  return `${apiConfig.origin}/${path}`;
}
