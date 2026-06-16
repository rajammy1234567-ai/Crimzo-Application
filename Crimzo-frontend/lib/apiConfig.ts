import { Platform } from 'react-native';
import Constants from 'expo-constants';

const PORT = '5001';
// Your PC WiFi IPv4 — run `ipconfig` and update if this changes
const DEV_LAN_HOST = '192.168.1.7';

const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.replace(/\/$/, '');

function addUnique(list: string[], url: string) {
  const normalized = url.replace(/\/$/, '');
  if (!list.includes(normalized)) list.push(normalized);
}

/** Ordered list of backend URLs to try (first = preferred). */
export function getApiUrlCandidates(): string[] {
  const candidates: string[] = [];

  if (Platform.OS === 'web') {
    if (envUrl) addUnique(candidates, envUrl);
    addUnique(candidates, `http://localhost:${PORT}`);
    return candidates;
  }

  if (Platform.OS === 'ios' && !Constants.isDevice) {
    addUnique(candidates, `http://localhost:${PORT}`);
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