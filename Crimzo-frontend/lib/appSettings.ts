import AsyncStorage from '@react-native-async-storage/async-storage';
import { publish, subscribe } from './realtimeSync';

export const SETTINGS_KEY = 'app_settings';

export type AppSettings = {
  notificationsEnabled: boolean;
  language: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  notificationsEnabled: true,
  language: 'Automatic',
};

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveAppSettings(next: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  publish('app_settings_changed', next);
}

export function onAppSettingsChange(handler: (settings: AppSettings) => void) {
  return subscribe('app_settings_changed', (payload) => {
    if (payload && typeof payload === 'object') {
      handler({ ...DEFAULT_SETTINGS, ...(payload as AppSettings) });
    }
  });
}