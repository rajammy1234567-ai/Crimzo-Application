import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { appAlert } from '../lib/appAlert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { API_URL, apiFetch, apiGet, apiPost, ApiError } from '../lib/apiClient';
import { mergeBeanBalance } from '../lib/beanBalance';
import { getApiUrlCandidates, setActiveApiUrl } from '../lib/apiConfig';
import { clearPendingReferralCode, getReferralSignupPayload } from '../lib/referral';
if (typeof window !== 'undefined' || (typeof navigator !== 'undefined' && navigator.product === 'ReactNative')) {
  console.log('%c🔗 Crimzo using backend:', 'color:#0f0', API_URL);
}
if (API_URL.includes('localhost') && typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
  console.warn('%c⚠️ Using localhost backend URL from a mobile device/emulator may not reach your dev PC. Set EXPO_PUBLIC_BACKEND_URL to your computer LAN IP (e.g. http://192.168.1.105:5001) in .env and restart expo.', 'color:#f80; font-weight:bold');
}

// Warmup backend on start (helps in dev)
let _backendReady = false;
const warmupBackend = async () => {
  const candidates = getApiUrlCandidates();
  for (const base of candidates) {
    try {
      const res = await fetch(`${base}/api/health`, { method: 'GET' });
      if (res.ok) {
        _backendReady = true;
        setActiveApiUrl(base);
        console.log('✅ Backend reachable at', base);
        return;
      }
    } catch {
      // try next candidate
    }
  }
  if (!_backendReady) {
    console.warn('⚠️ Backend not reachable. Tried:', candidates.join(', '));
  }
};
warmupBackend();
setTimeout(() => { if (!_backendReady) warmupBackend(); }, 3000);

interface User {
  id: string | number;
  crimzo_id?: string;
  email: string;
  username: string;
  avatar?: string;
  bio?: string;
  country: string;
  diamonds: number;
  beans: number;
  pendingTaskBeans?: number;
  totalBeans?: number;
  totalWithdrawableBeans?: number;
  withdrawableInr?: number;
  wallet_balance?: number;
  followers_count: number;
  following_count: number;
  friends_count: number;
  totalViews?: number;
  totalLikes?: number;
  is_online: boolean;
  status: string;
  is_private?: boolean;
  user_level?: number;
  equipped_level?: number;
  level_name?: string;
  level_badge_color?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  isGuest: boolean;
  login: (email: string, password: string) => Promise<void>;
  emailLogin: (email: string) => Promise<void>;
  register: (email: string, password: string, username: string, avatarUri?: string) => Promise<void>;
  guestLogin: () => Promise<void>;
  testLogin: () => Promise<void>;
  sendPhoneOtp: (phone: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, otp: string) => Promise<void>;
  sendEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, otp: string) => Promise<{ isNewUser: boolean }>;
  completeEmailRegistration: (email: string, username: string, password: string) => Promise<void>;
  signInWithGoogle: (profile: {
    email: string;
    name?: string;
    googleId?: string;
    avatar?: string;
    idToken?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      // Use multiGet for faster parallel read (instead of 3 separate getItem calls)
      const keys = ['auth_token', 'is_guest', 'cached_user'];
      const stores = await AsyncStorage.multiGet(keys);
      const storedToken = stores[0][1];
      const storedGuest = stores[1][1];
      const storedUser = stores[2][1];

      if (storedToken) {
        setToken(storedToken);
        if (storedGuest === 'true') setIsGuest(true);
        // Restore cached user INSTANTLY so app doesn't wait for network
        if (storedUser) {
          try { setUser(JSON.parse(storedUser)); } catch (_) { }
        }
        // Mark loading done immediately — user is restored from cache
        setLoading(false);
        // Refresh user data in background (non-blocking)
        fetchUser(storedToken);
        return;
      }
    } catch (error) {
      console.error('Load auth error:', error);
    }
    setLoading(false);
  };

  const fetchUser = async (authToken: string) => {
    try {
      const userData = await apiGet<User>('/api/auth/me', authToken, 10000);
      setUser(userData);
      AsyncStorage.setItem('cached_user', JSON.stringify(userData)).catch(() => { });
    } catch (error: unknown) {
      const status = error instanceof ApiError ? error.status : undefined;
      if (status === 403) {
        const banned = error instanceof ApiError && /suspended|banned/i.test(error.message);
        if (banned) {
          appAlert('Account Suspended', error.message || 'Your account has been suspended.');
        }
        await logout();
      } else if (status === 401 || status === 404) {
        await logout();
      }
    }
  };

  // ── Helper: save auth to state + storage in parallel ──
  const persistAuth = (authToken: string, userData: any, guest = false) => {
    setToken(authToken);
    setUser(userData);
    setIsGuest(guest);
    // Write to AsyncStorage in parallel (non-blocking for faster UX)
    const pairs: [string, string][] = [
      ['auth_token', authToken],
      ['cached_user', JSON.stringify(userData)],
    ];
    if (guest) pairs.push(['is_guest', 'true']);
    AsyncStorage.multiSet(pairs).catch(() => { });
    if (!guest) AsyncStorage.removeItem('is_guest').catch(() => { });
  };

  const login = async (email: string, password: string) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      console.log('Attempting login...', { email: normalizedEmail, API_URL });

      const data = await apiPost<{ token: string; user: User }>(
        '/api/auth/login',
        { email: normalizedEmail, password },
        null,
        15000,
      );

      console.log('Login response:', data);
      persistAuth(data.token, data.user);
    } catch (error: unknown) {
      console.error('Login error:', error instanceof Error ? error.message : error);
      if (error instanceof ApiError) {
        if (error.status === 408) {
          throw new Error('Server is waking up. Please wait a moment and try again.');
        }
        if (error.status === 0) {
          throw new Error(
            `Cannot reach backend at ${API_URL}. Start backend: cd crimzo_app_backend && npm start. Restart Expo: npx expo start -c`
          );
        }
        throw new Error(error.message);
      }
      throw new Error(error instanceof Error ? error.message : 'Login failed. Please check your connection.');
    }
  };

  const register = async (email: string, password: string, username: string, avatarUri?: string) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      console.log('Attempting registration...', { email: normalizedEmail, username, hasAvatar: !!avatarUri, API_URL });

      // Use FormData with fetch API for better React Native compatibility
      const formData = new FormData();
      formData.append('email', normalizedEmail);
      formData.append('password', password);
      formData.append('username', username.trim());

      if (avatarUri) {
        const filename = avatarUri.split('/').pop() || `avatar_${Date.now()}.jpg`;
        if (Platform.OS === 'web') {
          const resp = await fetch(avatarUri);
          const blob = await resp.blob();
          const file = new File([blob], filename, { type: 'image/jpeg' });
          formData.append('avatar', file);
        } else {
          formData.append('avatar', { uri: avatarUri, name: filename, type: 'image/jpeg' } as any);
        }
      }

      const referralPayload = await getReferralSignupPayload();
      Object.entries(referralPayload).forEach(([key, value]) => {
        formData.append(key, String(value));
      });

      // Use fetch instead of axios for FormData (better React Native support)
      const data = await apiFetch<{ token: string; user: User }>('/api/auth/register', {
        method: 'POST',
        body: formData,
        timeoutMs: 30000,
      });

      console.log('Registration response:', data);
      await clearPendingReferralCode();
      persistAuth(data.token, data.user);
    } catch (error: unknown) {
      const message = error instanceof ApiError ? error.message : (error instanceof Error ? error.message : 'Registration failed');
      console.error('Registration error:', message);
      throw new Error(message || 'Registration failed. Please check your connection.');
    }
  };

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([
      'auth_token',
      'is_guest',
      'cached_user',
      'viewed_story_users',
      'app_settings',
    ]);
    setToken(null);
    setUser(null);
    setIsGuest(false);
  }, []);

  const signInWithGoogle = async (profile: {
    email: string;
    name?: string;
    googleId?: string;
    avatar?: string;
    idToken?: string;
  }) => {
    try {
      const referralPayload = await getReferralSignupPayload();
      const data = await apiPost<{ token: string; user: User }>(
        '/api/auth/google',
        {
          email: profile.email.trim().toLowerCase(),
          name: profile.name,
          googleId: profile.googleId,
          avatar: profile.avatar,
          idToken: profile.idToken,
          ...referralPayload,
        },
        null,
        15000,
      );
      await clearPendingReferralCode();
      persistAuth(data.token, data.user);
    } catch (error: unknown) {
      throw new Error(error instanceof ApiError ? error.message : 'Google sign-in failed.');
    }
  };

  // ── Email Login (legacy — email only, no OAuth) ──
  const emailLogin = async (email: string) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      console.log('Attempting email login (google endpoint)...', { email: normalizedEmail });
      const data = await apiPost<{ token: string; user: User }>(
        '/api/auth/google',
        { email: normalizedEmail },
        null,
        15000,
      );
      persistAuth(data.token, data.user);
    } catch (error: unknown) {
      console.error('Email login error:', error instanceof Error ? error.message : error);
      throw new Error(error instanceof ApiError ? error.message : 'Login failed. Please check your email.');
    }
  };

  // ── Test Login (dev only — no OTP, no server) ──
  const testLogin = async () => {
    try {
      const data = await apiPost<{ token: string; user: User }>('/api/auth/guest', {}, null, 15000);
      const userData = { ...data.user, username: 'DevTestUser' };
      persistAuth(data.token, userData);
    } catch (e) {
      console.error('TestLogin failed, backend may be offline:', e);
      appAlert('Dev Login Failed', 'Backend is offline. Start the backend server first.');
    }
  };

  // ── Guest Login ──
  const guestLogin = async () => {
    try {
      console.log('Attempting guest login...', { API_URL });
      const data = await apiPost<{ token: string; user: User }>('/api/auth/guest', {}, null, 15000);
      persistAuth(data.token, data.user, true);
    } catch (error: unknown) {
      console.error('Guest login error:', error instanceof Error ? error.message : error);
      throw new Error(error instanceof ApiError ? error.message : 'Guest login failed. Check your connection.');
    }
  };


  // ── Phone OTP ──
  const sendPhoneOtp = async (phone: string) => {
    try {
      console.log('Sending OTP to:', phone);
      await apiPost('/api/auth/phone/send-otp', { phone }, null, 15000);
      console.log('OTP sent successfully');
    } catch (error: unknown) {
      console.error('Send OTP error:', error instanceof Error ? error.message : error);
      throw new Error(error instanceof ApiError ? error.message : 'Failed to send OTP.');
    }
  };

  const verifyPhoneOtp = async (phone: string, otp: string) => {
    try {
      console.log('Verifying OTP for:', phone);
      const referralPayload = await getReferralSignupPayload();
      const data = await apiPost<{ token: string; user: User }>(
        '/api/auth/phone/verify-otp',
        { phone, otp, ...referralPayload },
        null,
        15000,
      );
      await clearPendingReferralCode();
      persistAuth(data.token, data.user);
    } catch (error: unknown) {
      console.error('Verify OTP error:', error instanceof Error ? error.message : error);
      throw new Error(error instanceof ApiError ? error.message : 'OTP verification failed.');
    }
  };

  const updateUser = useCallback((userData: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...userData, ...mergeBeanBalance({ ...prev, ...userData }, userData) };
      AsyncStorage.setItem('cached_user', JSON.stringify(updated)).catch(() => { });
      return updated;
    });
  }, []);

  // ── Email OTP: Send ──
  const sendEmailOtp = async (email: string) => {
    try {
      await apiPost('/api/auth/email/send-otp', { email: email.trim().toLowerCase() }, null, 15000);
    } catch (error: unknown) {
      throw new Error(error instanceof ApiError ? error.message : 'Failed to send OTP to email.');
    }
  };

  // ── Email OTP: Verify ──
  const verifyEmailOtp = async (email: string, otp: string): Promise<{ isNewUser: boolean }> => {
    try {
      const response = await apiPost<{
        isNewUser: boolean;
        token?: string;
        user?: User;
      }>(
        '/api/auth/email/verify-otp',
        { email: email.trim().toLowerCase(), otp },
        null,
        15000,
      );
      const { isNewUser, token: authToken, user: userData } = response;
      if (!isNewUser && authToken && userData) {
        persistAuth(authToken, userData);
      }
      return { isNewUser };
    } catch (error: unknown) {
      throw new Error(error instanceof ApiError ? error.message : 'OTP verification failed.');
    }
  };

  // ── Email OTP: Complete Registration ──
  const completeEmailRegistration = async (email: string, username: string, password: string) => {
    try {
      const referralPayload = await getReferralSignupPayload();
      const data = await apiPost<{ token: string; user: User }>(
        '/api/auth/email/complete-registration',
        {
          email: email.trim().toLowerCase(),
          username: username.trim(),
          password,
          ...referralPayload,
        },
        null,
        15000,
      );
      await clearPendingReferralCode();
      persistAuth(data.token, data.user);
    } catch (error: unknown) {
      throw new Error(error instanceof ApiError ? error.message : 'Registration failed.');
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, isGuest, login, emailLogin, register, guestLogin, testLogin, sendPhoneOtp, verifyPhoneOtp, sendEmailOtp, verifyEmailOtp, completeEmailRegistration, signInWithGoogle, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
