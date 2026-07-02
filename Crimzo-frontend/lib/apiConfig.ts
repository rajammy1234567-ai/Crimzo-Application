import { Platform } from 'react-native';
import Constants from 'expo-constants';

const PORT = '5001';
const DEV_LAN_HOST = '192.168.1.8';
export const PRODUCTION_BACKEND_URL = 'https://crimzo-application-backend.onrender.com';

function readConfiguredBackendUrl(): string | undefined {
  const fromProcess = process.env.EXPO_PUBLIC_BACKEND_URL;
  const fromExtra =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ??
    (Constants as { manifest?: { extra?: { EXPO_PUBLIC_BACKEND_URL?: string } } }).manifest?.extra
      ?.EXPO_PUBLIC_BACKEND_URL;
  const raw = (fromProcess || fromExtra || '').replace(/\/$/, '');
  return raw || undefined;
}

const rawEnvUrl = readConfiguredBackendUrl();

function isLocalDevUrl(url?: string): boolean {
  if (!url) return false;
  return /localhost|127\.0\.0\.1|192\.168\.|10\.0\.2\.2/i.test(url);
}

function resolveEnvUrl(): string {
  if (!rawEnvUrl) return PRODUCTION_BACKEND_URL;
  if (!__DEV__ && isLocalDevUrl(rawEnvUrl)) return PRODUCTION_BACKEND_URL;
  return rawEnvUrl;
}

const envUrl = resolveEnvUrl();

type ApiUrlListener = (url: string) => void;
const apiUrlListeners = new Set<ApiUrlListener>();

export function subscribeApiUrl(listener: ApiUrlListener): () => void {
  apiUrlListeners.add(listener);
  listener(API_URL);
  return () => {
    apiUrlListeners.delete(listener);
  };
}

export function isDeployedBackend(url?: string): boolean {
  return !!url && url.startsWith('https://');
}

function addUnique(list: string[], url: string) {
  const normalized = url.replace(/\/$/, '');
  if (!list.includes(normalized)) list.push(normalized);
}

function appendDevProductionFallback(candidates: string[]) {
  if (__DEV__ && isLocalDevUrl(rawEnvUrl)) {
    addUnique(candidates, PRODUCTION_BACKEND_URL);
  }
}

/** Ordered list of backend URLs to try (first = preferred). */
export function getApiUrlCandidates(): string[] {
  const candidates: string[] = [];
  const localUrl = `http://localhost:${PORT}`;

  if (envUrl && isDeployedBackend(envUrl)) {
    addUnique(candidates, envUrl);
    return candidates;
  }

  if (Platform.OS === 'web') {
    if (envUrl && isLocalDevUrl(envUrl)) {
      addUnique(candidates, localUrl);
      if (envUrl !== localUrl) addUnique(candidates, envUrl);
      appendDevProductionFallback(candidates);
      return candidates;
    }
    addUnique(candidates, PRODUCTION_BACKEND_URL);
    addUnique(candidates, localUrl);
    return candidates;
  }

  if (Platform.OS === 'ios' && !Constants.isDevice) {
    addUnique(candidates, localUrl);
    if (envUrl) addUnique(candidates, envUrl);
    addUnique(candidates, `http://${DEV_LAN_HOST}:${PORT}`);
    appendDevProductionFallback(candidates);
    return candidates;
  }

  if (Platform.OS === 'android' && !Constants.isDevice) {
    addUnique(candidates, `http://10.0.2.2:${PORT}`);
    if (envUrl) addUnique(candidates, envUrl);
    addUnique(candidates, `http://${DEV_LAN_HOST}:${PORT}`);
    appendDevProductionFallback(candidates);
    return candidates;
  }

  if (envUrl) addUnique(candidates, envUrl);
  addUnique(candidates, `http://${DEV_LAN_HOST}:${PORT}`);
  appendDevProductionFallback(candidates);
  return candidates;
}

export function resolveApiUrl(): string {
  return getApiUrlCandidates()[0];
}

export let API_URL = resolveApiUrl();

export function setActiveApiUrl(url: string) {
  const next = url.replace(/\/$/, '');
  if (next === API_URL) return;
  API_URL = next;
  apiUrlListeners.forEach((listener) => listener(API_URL));
}