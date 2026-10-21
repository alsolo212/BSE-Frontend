import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const configPath = resolve('public/runtime-config.js');
const configuredApiOrigin = (process.env.BSE_API_ORIGIN ?? '').replace(/\/+$/, '');
const configuredApiBaseUrl = (process.env.BSE_API_BASE_URL ?? '').replace(/\/+$/, '');
const inferredOrigin = configuredApiBaseUrl.startsWith('http://') || configuredApiBaseUrl.startsWith('https://')
  ? new URL(configuredApiBaseUrl).origin
  : '';
const apiOrigin = configuredApiOrigin || inferredOrigin;
const apiBaseUrl = configuredApiBaseUrl || (apiOrigin ? `${apiOrigin}/api` : '/api');
const googleClientId = process.env.BSE_GOOGLE_CLIENT_ID ?? '';
const proxyTarget = apiOrigin || 'http://localhost:5000';

const proxyPath = resolve('proxy.conf.json');
const proxyConfig = {
  '/api': {
    target: proxyTarget,
    secure: false,
    changeOrigin: true
  },
  '/hubs': {
    target: proxyTarget,
    secure: false,
    changeOrigin: true,
    ws: true
  },
  '/uploads': {
    target: proxyTarget,
    secure: false,
    changeOrigin: true
  }
};

const content = `window.__BSE_CONFIG__ = ${JSON.stringify({
  apiOrigin,
  apiBaseUrl,
  googleClientId
})};\n`;

await mkdir(dirname(configPath), { recursive: true });
await writeFile(configPath, content, 'utf8');
await writeFile(proxyPath, `${JSON.stringify(proxyConfig, null, 2)}\n`, 'utf8');
