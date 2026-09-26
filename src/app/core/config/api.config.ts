export const apiConfig = {
  origin: 'http://localhost:5000',
  baseUrl: 'http://localhost:5000/api'
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
