import { AppState, AppStateStatus } from 'react-native';
import type { Socket } from 'socket.io-client';

let currentCategory = 'other';
let appState: AppStateStatus = AppState.currentState;

export function setAppTimeCategory(category: string) {
  currentCategory = category || 'other';
}

export function getAppTimeCategory() {
  return currentCategory;
}

export function routeToAppCategory(pathname: string): string {
  if (!pathname) return 'other';
  if (pathname.includes('/live')) return 'live';
  if (pathname.includes('/pk')) return 'pk';
  if (pathname.includes('/messages')) return 'messages';
  if (pathname.includes('/profile')) return 'profile';
  if (pathname.includes('/reels') || pathname.includes('(tabs)/reels')) return 'reels';
  if (pathname.includes('/create') || pathname.includes('(tabs)/create')) return 'create';
  if (pathname.includes('(tabs)/home') || pathname === '/') return 'home';
  return 'other';
}

export function attachAppTimeTracker(socket: Socket | null) {
  if (!socket) return () => {};

  const sendHeartbeat = () => {
    if (!socket.connected) return;
    const foreground = appState === 'active';
    socket.emit('presence_heartbeat', {
      category: currentCategory,
      foreground,
    });
  };

  const sub = AppState.addEventListener('change', (next) => {
    appState = next;
    sendHeartbeat();
  });

  sendHeartbeat();

  return () => {
    sub.remove();
  };
}