import { Platform } from 'react-native';
import Constants from 'expo-constants';

const PORT = '5001';
// Your PC WiFi IPv4 — run `ipconfig` and update if this changes
const DEV_LAN_HOST = '192.168.1.8';
const PRODUCTION_BACKEND_URL = 'https://crimzo-application-backend.onrender.com';

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

function isDeployedBackend(url?: string): boolean {
  return !!url && url.startsWith('https://');
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