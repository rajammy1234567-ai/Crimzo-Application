import { Platform } from 'react-native';
import Constants from 'expo-constants';

const PORT = '5001';
// Your PC WiFi IPv4 — run `ipconfig` and update if this changes
const DEV_LAN_HOST = '192.168.1.8';
export const PRODUCTION_BACKEND_URL = 'https://crimzo-application-backend.onrender.com';

/** Render free tier cold start can take 30–90s after sleep. */
export const LOCAL_REQUEST_TIMEOUT_MS = 20_000;
export const DEPLOYED_REQUEST_TIMEOUT_MS = 90_000;
export const WARMUP_PER_ATTEMPT_TIMEOUT_MS = 35_000;
export const WARMUP_MAX_ATTEMPTS = 8;
export const WARMUP_RETRY_BASE_DELAY_MS = 4_000;

const rawEnvUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.replace(/\/$/, '');

function isLocalDevUrl(url?: string): boolean {
  if (!url) return true;
  return /localhost|127\.0\.0\.1|192\.168\.|10\.0\.2\.2/i.test(url);
}

/** Release APK must hit production — .env LAN IP is only for local dev. */
function resolveEnvUrl(): string | undefined {
  if (!__DEV__ && isLocalDevUrl(rawEnvUrl)) {
    return PRODUCTION_BACKEND_URL;
  }
  return rawEnvUrl;
}

const envUrl = resolveEnvUrl();

export function isDeployedBackend(url?: string): boolean {
  return !!url && url.startsWith('https://');
}

export function getRequestTimeoutMs(baseUrl?: string): number {
  const url = baseUrl || resolveApiUrl();
  return isDeployedBackend(url) ? DEPLOYED_REQUEST_TIMEOUT_MS : LOCAL_REQUEST_TIMEOUT_MS;
}

export function getTransientRetryCount(baseUrl?: string): number {
  return isDeployedBackend(baseUrl || resolveApiUrl()) ? 6 : 3;
}

function addUnique(list: string[], url: string) {
  const normalized = url.replace(/\/$/, '');
  if (!list.includes(normalized)) list.push(normalized);
}

/** Ordered list of backend URLs to try (first = preferred). */
export function getApiUrlCandidates(): string[] {
  const candidates: string[] = [];

  // Deployed backend — same URL on emulator, device, and web
  if (envUrl && isDeployedBackend(envUrl)) {
    addUnique(candidates, envUrl);
    return candidates;
  }

  if (Platform.OS === 'web') {
    if (envUrl) addUnique(candidates, envUrl);
    addUnique(candidates, `http://localhost:${PORT}`);
    return candidates;
  }

  if (Platform.OS === 'ios' && !Constants.isDevice) {
    addUnique(candidates, `http://localhost:${PORT}`);
    if (envUrl) addUnique(candidates, envUrl);
    addUnique(candidates, `http://${DEV_LAN_HOST}:${PORT}`);
    return candidates;
  }

  if (Platform.OS === 'android' && !Constants.isDevice) {
    // Try emulator loopback first; fall back to LAN when 10.0.2.2 fails (common on Windows)
    addUnique(candidates, `http://10.0.2.2:${PORT}`);
    if (envUrl) addUnique(candidates, envUrl);
    addUnique(candidates, `http://${DEV_LAN_HOST}:${PORT}`);
    return candidates;
  }

  // Physical phone / tablet — same WiFi + PC LAN IP
  if (envUrl) addUnique(candidates, envUrl);
  addUnique(candidates, `http://${DEV_LAN_HOST}:${PORT}`);
  return candidates;
}

export function resolveApiUrl(): string {
  return getApiUrlCandidates()[0];
}

export let API_URL = resolveApiUrl();

export function setActiveApiUrl(url: string) {
  API_URL = url.replace(/\/$/, '');
}