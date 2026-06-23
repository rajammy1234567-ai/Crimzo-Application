import React, { useState, useEffect, useCallback } from 'react';
import { appAlert } from '../../lib/appAlert';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Linking, Switch, Modal, Platform, Share, TextInput } from 'react-native';
import { KeyboardModalFrame } from '../../components/KeyboardAware';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PRIVACY_URL, TERMS_URL, apiFetch, apiGet } from '../../lib/apiClient';
import {
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
  DEFAULT_SETTINGS,
} from '../../lib/appSettings';
import { APP_VERSION, getBuildLabel } from '../../lib/buildInfo';
import { inrToBeans } from '../../lib/diamondPackages';
import { MIN_RATE_INR, MAX_RATE_INR } from '../../lib/userRates';
const SUPPORT_EMAIL = 'support@crimzo.app';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.livestreamhub';

const DEVELOPERS = [
  { name: 'Divyanshu Chauhan', role: 'Lead Developer' },
  { name: 'Sunaina Sharma', role: 'Frontend Developer' },
  { name: 'Abhinav Anand', role: 'Backend Developer' },
];

const ABOUT_FEATURES = [
  'Live streaming and PK battles',
  'Reels and 24-hour stories',
  'Direct messaging and video calls',
  'Virtual gifts, wallet and rewards',
  'Follow requests and notifications',
];

const ABOUT_SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Our Mission',
    body:
      'Crimzo brings creators and communities together in one place — to go live, share moments, and build real connections without friction.',
  },
  {
    title: 'What We Offer',
    body:
      'From short-form reels and ephemeral stories to one-on-one chats and live rooms, Crimzo is built for everyday creators who want a simple, reliable social experience.',
  },
  {
    title: 'Built for Creators',
    body:
      'Monetise through virtual gifts, manage your wallet securely, grow your audience with follow-based feeds, and stay in touch with fans through messages and calls — all within the app.',
  },
];

type LegalType = 'privacy' | 'terms' | null;

const LEGAL_CONTENT: Record<'privacy' | 'terms', { title: string; sections: { heading: string; body: string }[] }> = {
  privacy: {
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'What we collect',
        body: 'Account info (email, username, avatar), content you post (reels, stories, messages), and usage data to keep Crimzo running smoothly.',
      },
      {
        heading: 'How we use it',
        body: 'To power social features, live streams, wallet payments, and push notifications you enable in Settings.',
      },
      {
        heading: 'Third parties',
        body: 'Media is hosted on Cloudinary; payments use Razorpay. We never sell your personal data.',
      },
      {
        heading: 'Contact',
        body: `Questions? Email us at ${SUPPORT_EMAIL}. You can request account or data deletion anytime.`,
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    sections: [
      {
        heading: 'Community rules',
        body: 'Be respectful. No illegal, abusive, or spam content. You must be 13+ to use Crimzo.',
      },
      {
        heading: 'Virtual currency',
        body: 'Diamonds and beans are in-app items with no real-world cash value unless stated otherwise by law.',
      },
      {
        heading: 'Your content',
        body: 'You own what you create. By posting, you allow Crimzo to display it within the app.',
      },
      {
        heading: 'Account',
        body: 'We may suspend accounts that break these rules. Contact support to close your account.',
      },
    ],
  },
};

function formatCacheSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function estimateCacheSize(): Promise<number> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const pairs = await AsyncStorage.multiGet(keys.filter((k) => k !== 'auth_token' && k !== 'cached_user'));
    return pairs.reduce((sum, [, v]) => sum + (v?.length || 0), 0);
  } catch {
    return 0;
  }
}

export default function SettingsScreen() {
  const { logout, token, user, updateUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [cacheSize, setCacheSize] = useState('—');
  const [aboutVisible, setAboutVisible] = useState(false);
  const [legalType, setLegalType] = useState<LegalType>(null);
  const [saving, setSaving] = useState(false);
  const [voiceRate, setVoiceRate] = useState('1');
  const [chatRate, setChatRate] = useState('1');
  const [ratesModalVisible, setRatesModalVisible] = useState(false);
  const [ratesSaving, setRatesSaving] = useState(false);
  const [isPrivateAccount, setIsPrivateAccount] = useState(false);
  const [privacySaving, setPrivacySaving] = useState(false);

  const refreshCacheSize = useCallback(async () => {
    const bytes = await estimateCacheSize();
    setCacheSize(formatCacheSize(bytes));
  }, []);

  useEffect(() => {
    (async () => {
      const local = await loadAppSettings();
      setSettings(local);
      await refreshCacheSize();
      if (token) {
        try {
          const res = await apiGet<{
            success?: boolean;
            profile?: {
              language?: string;
              push_notifications_enabled?: boolean;
              is_private?: boolean;
              voiceRatePerMin?: number;
              chatRatePerMin?: number;
            };
          }>('/api/user/profile/full', token);
          if (res.success && res.profile) {
            setIsPrivateAccount(!!res.profile.is_private);
            const lang = res.profile.language === 'Hindi' ? 'Hindi'
              : res.profile.language === 'English' ? 'English'
                : local.language;
            const merged = {
              notificationsEnabled: res.profile.push_notifications_enabled !== false,
              language: lang,
            };
            setSettings(merged);
            await saveAppSettings(merged);
            if (res.profile.voiceRatePerMin != null) {
              setVoiceRate(String(res.profile.voiceRatePerMin));
            }
            if (res.profile.chatRatePerMin != null) {
              setChatRate(String(res.profile.chatRatePerMin));
            }
          }
        } catch {
          // use local settings
        }
      }
    })();
  }, [token, refreshCacheSize]);

  const persistPrivateAccount = async (nextPrivate: boolean) => {
    if (!token) return;
    setPrivacySaving(true);
    try {
      await apiFetch('/api/user/profile', {
        method: 'PUT',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_private: nextPrivate }),
      });
      setIsPrivateAccount(nextPrivate);
      updateUser({ ...user, is_private: nextPrivate } as any);
    } catch {
      appAlert('Error', 'Could not update account privacy. Try again.');
    } finally {
      setPrivacySaving(false);
    }
  };

  const handlePrivateAccountToggle = (nextPrivate: boolean) => {
    if (nextPrivate) {
      appAlert(
        'Private Account',
        'Only people you approve can see your posts and stories. Your current followers stay the same.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Turn On', onPress: () => persistPrivateAccount(true) },
        ],
      );
      return;
    }
    persistPrivateAccount(false);
  };

  const persistSettings = async (next: AppSettings) => {
    setSettings(next);
    await saveAppSettings(next);
    if (!token) return;
    setSaving(true);
    try {
      const lang = next.language === 'Automatic' ? 'English' : next.language;
      await apiFetch('/api/user/profile', {
        method: 'PUT',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: lang,
          push_notifications_enabled: next.notificationsEnabled,
        }),
      });
      updateUser({
        ...user,
        language: lang,
        push_notifications_enabled: next.notificationsEnabled,
      } as any);
    } catch {
      // local save still applies
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    appAlert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleClearCache = () => {
    appAlert('Clear Cache', 'Clear temporary app data? Your login will stay saved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        onPress: async () => {
          const keys = await AsyncStorage.getAllKeys();
          const toRemove = keys.filter(
            (k) => !['auth_token', 'cached_user', 'app_settings'].includes(k),
          );
          if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
          await refreshCacheSize();
          appAlert('Done', 'Cache cleared successfully.');
        },
      },
    ]);
  };

  const openURL = async (url: string, fallback: LegalType) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      // fall through
    }
    setLegalType(fallback);
  };

  const pickLanguage = () => {
    appAlert('App Language', 'Select your preferred language', [
      { text: 'Automatic', onPress: () => persistSettings({ ...settings, language: 'Automatic' }) },
      { text: 'English', onPress: () => persistSettings({ ...settings, language: 'English' }) },
      { text: 'Hindi', onPress: () => persistSettings({ ...settings, language: 'Hindi' }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleRate = async () => {
    try {
      const url = Platform.OS === 'android'
        ? `market://details?id=com.livestreamhub`
        : PLAY_STORE_URL;
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      // fallback
    }
    try {
      await Share.share({
        message: `I'm loving Crimzo! Join me — live streams, reels & more. ${PLAY_STORE_URL}`,
      });
    } catch {
      appAlert('Rate Crimzo', 'Thank you! Find us on the Play Store as "Crimzo".');
    }
  };

  const saveCreatorRates = async () => {
    if (!token) return;
    const voice = Number(voiceRate);
    const chat = Number(chatRate);
    if (!Number.isFinite(voice) || voice < MIN_RATE_INR || voice > MAX_RATE_INR) {
      appAlert('Invalid Rate', `Voice rate must be between ₹${MIN_RATE_INR} and ₹${MAX_RATE_INR}/min`);
      return;
    }
    if (!Number.isFinite(chat) || chat < MIN_RATE_INR || chat > MAX_RATE_INR) {
      appAlert('Invalid Rate', `Chat rate must be between ₹${MIN_RATE_INR} and ₹${MAX_RATE_INR}/min`);
      return;
    }
    setRatesSaving(true);
    try {
      await apiFetch('/api/user/profile', {
        method: 'PUT',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice_rate_per_min_inr: voice,
          chat_rate_per_min_inr: chat,
        }),
      });
      setRatesModalVisible(false);
      appAlert(
        'Rates Updated',
        `Voice: ₹${voice}/min (${inrToBeans(voice)} beans/min)\nChat: ₹${chat}/min (${inrToBeans(chat)} beans/min)`,
      );
    } catch {
      appAlert('Error', 'Could not save your rates. Try again.');
    } finally {
      setRatesSaving(false);
    }
  };

  const contactSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Crimzo%20Support`).catch(() => {
      appAlert('Customer Service', `Email us at ${SUPPORT_EMAIL}`);
    });
  };

  const sections: {
    title: string;
    items: {
      icon: string;
      label: string;
      value?: string;
      valueColor?: string;
      toggle?: boolean;
      toggleValue?: boolean;
      onToggle?: (v: boolean) => void;
      onPress?: () => void;
      hideChevron?: boolean;
    }[];
  }[] = [
    {
      title: 'Creator Rates',
      items: [
        {
          icon: 'call-outline',
          label: 'Voice Call Rate',
          value: `₹${voiceRate}/min · ${inrToBeans(Number(voiceRate) || 1)} beans`,
          onPress: () => setRatesModalVisible(true),
        },
        {
          icon: 'chatbubbles-outline',
          label: 'Live Chat Rate',
          value: `₹${chatRate}/min · ${inrToBeans(Number(chatRate) || 1)} beans`,
          onPress: () => setRatesModalVisible(true),
        },
      ],
    },
    {
      title: 'Privacy',
      items: [
        {
          icon: 'lock-closed-outline',
          label: 'Private Account',
          value: isPrivateAccount ? 'On' : 'Off',
          toggle: true,
          hideChevron: true,
          toggleValue: isPrivateAccount,
          onToggle: handlePrivateAccountToggle,
        },
      ],
    },
    {
      title: 'Account',
      items: [
        {
          icon: 'person-outline',
          label: 'Edit Profile',
          onPress: () => router.push('/profile/edit' as any),
        },
        {
          icon: 'mail-unread-outline',
          label: 'Notification Inbox',
          onPress: () => router.push('/profile/notifications' as any),
        },
        {
          icon: 'notifications-outline',
          label: 'Push Notifications', toggle: true, hideChevron: true,
          toggleValue: settings.notificationsEnabled,
          onToggle: (v) => persistSettings({ ...settings, notificationsEnabled: v }),
        },
        {
          icon: 'language-outline',
          label: 'App Language', value: settings.language,
          onPress: pickLanguage,
        },
        {
          icon: 'ban-outline',
          label: 'Blocked Users',
          onPress: () => router.push('/profile/blacklist' as any),
        },
      ],
    },
    {
      title: 'Legal',
      items: [
        {
          icon: 'shield-checkmark-outline',
          label: 'Privacy Policy',
          onPress: () => openURL(PRIVACY_URL, 'privacy'),
        },
        {
          icon: 'document-text-outline',
          label: 'User Agreement',
          onPress: () => openURL(TERMS_URL, 'terms'),
        },
      ],
    },
    {
      title: 'App',
      items: [
        {
          icon: 'information-circle-outline',
          label: 'About',
          onPress: () => setAboutVisible(true),
        },
        {
          icon: 'star-outline',
          label: 'Rate Crimzo',
          onPress: handleRate,
        },
        {
          icon: 'trash-outline',
          label: 'Clear Cache', value: cacheSize,
          onPress: handleClearCache,
        },
        {
          icon: 'phone-portrait-outline',
          label: 'Version', value: APP_VERSION,
          hideChevron: true,
        },
        {
          icon: 'headset-outline',
          label: 'Customer Service',
          value: SUPPORT_EMAIL,
          onPress: contactSupport,
        },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F5F5" />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {(saving || privacySaving) && (
          <Text style={styles.syncHint}>Saving preferences…</Text>
        )}

        {sections.map((section, si) => (
          <View key={si} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.menuContainer}>
              {section.items.map((item, ii) => {
                const isToggle = !!item.toggle;
                const Row = isToggle ? View : TouchableOpacity;
                return (
                  <Row
                    key={ii}
                    style={[styles.menuItem, ii < section.items.length - 1 && styles.menuItemBorder]}
                    {...(isToggle ? {} : { onPress: item.onPress, activeOpacity: 0.6 })}
                  >
                    <View style={styles.iconBox}>
                      <Ionicons name={item.icon as any} size={20} color="#3C3C43" />
                    </View>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    <View style={styles.menuRight}>
                      {isToggle ? (
                        <Switch
                          value={item.toggleValue}
                          onValueChange={item.onToggle}
                          trackColor={{ false: '#E5E5EA', true: '#34C759' }}
                          thumbColor="#FFF"
                        />
                      ) : (
                        <>
                          {item.value !== undefined && (
                            <Text
                              style={[styles.menuValue, item.valueColor ? { color: item.valueColor } : {}]}
                              numberOfLines={1}
                            >
                              {item.value}
                            </Text>
                          )}
                          {!item.hideChevron && (
                            <Ionicons name="chevron-forward" size={18} color="#C0C0C0" />
                          )}
                        </>
                      )}
                    </View>
                  </Row>
                );
              })}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>Crimzo © 2026. All rights reserved.</Text>
      </ScrollView>

      {/* ── Creator rates ── */}
      <Modal visible={ratesModalVisible} animationType="slide" onRequestClose={() => setRatesModalVisible(false)}>
        <KeyboardModalFrame style={[styles.ratesContainer, { paddingTop: insets.top }]}>
          <View style={styles.ratesHeader}>
            <TouchableOpacity onPress={() => setRatesModalVisible(false)} style={styles.backBtn}>
              <Ionicons name="close" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={styles.ratesTitle}>Set Your Rates</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <Text style={styles.ratesHint}>
              Viewers pay from wallet (₹/min). You earn beans — e.g. 2 min at ₹1/min = ₹2 deducted from them, {inrToBeans(2)} beans added to you.
            </Text>

            <Text style={styles.ratesLabel}>Voice call — ₹/min</Text>
            <TextInput
              style={styles.ratesInput}
              value={voiceRate}
              onChangeText={setVoiceRate}
              keyboardType="decimal-pad"
              placeholder={`${MIN_RATE_INR} - ${MAX_RATE_INR}`}
            />
            <Text style={styles.ratesBeans}>You earn {inrToBeans(Number(voiceRate) || 0)} beans/min</Text>

            <Text style={[styles.ratesLabel, { marginTop: 20 }]}>Live chat — ₹/min</Text>
            <TextInput
              style={styles.ratesInput}
              value={chatRate}
              onChangeText={setChatRate}
              keyboardType="decimal-pad"
              placeholder={`${MIN_RATE_INR} - ${MAX_RATE_INR}`}
            />
            <Text style={styles.ratesBeans}>You earn {inrToBeans(Number(chatRate) || 0)} beans/min</Text>

            <TouchableOpacity
              style={[styles.ratesSaveBtn, ratesSaving && { opacity: 0.6 }]}
              onPress={() => void saveCreatorRates()}
              disabled={ratesSaving}
              activeOpacity={0.85}
            >
              <Text style={styles.ratesSaveText}>{ratesSaving ? 'Saving…' : 'Save Rates'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardModalFrame>
      </Modal>

      {/* ── About ── */}
      <Modal visible={aboutVisible} animationType="slide" onRequestClose={() => setAboutVisible(false)}>
        <View style={[styles.aboutContainer, { paddingTop: insets.top }]}>
          <View style={styles.aboutHeader}>
            <TouchableOpacity onPress={() => setAboutVisible(false)} style={styles.backBtn}>
              <Ionicons name="close" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={styles.aboutHeaderTitle}>About</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView
            style={styles.aboutScroll}
            contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.aboutAppTitle}>Crimzo</Text>
            <Text style={styles.aboutTagline}>Connect. Create. Go Live.</Text>
            <Text style={styles.aboutVersionLine}>Version {APP_VERSION}</Text>
            <Text style={styles.aboutBuildLine}>{getBuildLabel()}</Text>

            <Text style={styles.aboutIntro}>
              Crimzo is a next-generation social platform designed for live entertainment,
              short video, and meaningful interaction between creators and their audience.
            </Text>

            {ABOUT_SECTIONS.map((section) => (
              <View key={section.title} style={styles.aboutTextBlock}>
                <Text style={styles.aboutBlockTitle}>{section.title}</Text>
                <Text style={styles.aboutBlockBody}>{section.body}</Text>
              </View>
            ))}

            <Text style={styles.aboutGroupLabel}>Platform Highlights</Text>
            <View style={styles.aboutGroupCard}>
              {ABOUT_FEATURES.map((feature, i) => (
                <View
                  key={feature}
                  style={[styles.featureRow, i < ABOUT_FEATURES.length - 1 && styles.devRowBorder]}
                >
                  <Text style={styles.featureBullet}>•</Text>
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>

            <View style={styles.aboutTextBlock}>
              <Text style={styles.aboutBlockTitle}>Our Commitment</Text>
              <Text style={styles.aboutBlockBody}>
                We are committed to a safe, respectful community. Your privacy matters to us,
                and we continue to improve performance, security, and creator tools with every
                update. For feedback or issues, our support team is always reachable.
              </Text>
            </View>

            <Text style={styles.aboutGroupLabel}>Development Team</Text>
            <View style={styles.aboutGroupCard}>
              {DEVELOPERS.map((dev, i) => (
                <View
                  key={dev.name}
                  style={[styles.devRow, i < DEVELOPERS.length - 1 && styles.devRowBorder]}
                >
                  <Text style={styles.devName}>{dev.name}</Text>
                  <Text style={styles.devRole}>{dev.role}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.aboutGroupLabel}>Support</Text>
            <TouchableOpacity style={styles.aboutGroupCard} onPress={contactSupport} activeOpacity={0.7}>
              <View style={styles.supportRow}>
                <Text style={styles.supportLabel}>Email</Text>
                <Text style={styles.supportValue}>{SUPPORT_EMAIL}</Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.aboutMadeIn}>Designed and developed in India</Text>
            <Text style={styles.aboutCopyright}>© 2026 Crimzo Technologies. All rights reserved.</Text>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Legal fallback modal ── */}
      <Modal visible={!!legalType} animationType="slide" onRequestClose={() => setLegalType(null)}>
        <View style={[styles.legalContainer, { paddingTop: insets.top }]}>
          <View style={styles.legalHeader}>
            <TouchableOpacity onPress={() => setLegalType(null)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={styles.legalTitle}>
              {legalType ? LEGAL_CONTENT[legalType].title : ''}
            </Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            {legalType && LEGAL_CONTENT[legalType].sections.map((s) => (
              <View key={s.heading} style={styles.legalBlock}>
                <Text style={styles.legalHeading}>{s.heading}</Text>
                <Text style={styles.legalBody}>{s.body}</Text>
              </View>
            ))}
            <TouchableOpacity
              style={styles.legalWebBtn}
              onPress={() => legalType && Linking.openURL(legalType === 'privacy' ? PRIVACY_URL : TERMS_URL)}
            >
              <Text style={styles.legalWebText}>Open full document in browser</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14, backgroundColor: '#FFF',
    borderBottomWidth: 0.5, borderBottomColor: '#E0E0E0',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#1A1A1A', fontSize: 17, fontWeight: '700' },
  scroll: { flex: 1 },
  syncHint: { textAlign: 'center', color: '#999', fontSize: 12, marginTop: 8 },
  section: { marginTop: 20 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#888',
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginLeft: 20, marginBottom: 6,
  },
  menuContainer: {
    backgroundColor: '#FFF', borderRadius: 14,
    marginHorizontal: 16, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  menuItemBorder: { borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0' },
  iconBox: {
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
  },
  menuLabel: { color: '#1A1A1A', fontSize: 15, fontWeight: '500', flex: 1 },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '45%' },
  menuValue: { color: '#999', fontSize: 13, fontWeight: '500', flexShrink: 1 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 24,
    paddingVertical: 16, borderRadius: 14,
  },
  logoutText: { color: '#FF3B30', fontSize: 16, fontWeight: '500' },
  footerText: { textAlign: 'center', color: '#C0C0C0', fontSize: 12, marginTop: 20 },

  aboutContainer: { flex: 1, backgroundColor: '#F2F2F7' },
  aboutHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#C6C6C8',
  },
  aboutHeaderTitle: { color: '#1A1A1A', fontSize: 17, fontWeight: '600' },
  aboutScroll: { flex: 1 },
  aboutAppTitle: {
    color: '#1A1A1A', fontSize: 22, fontWeight: '600',
    marginTop: 28, marginHorizontal: 20,
  },
  aboutTagline: {
    color: '#8E8E93', fontSize: 15, fontWeight: '400',
    marginTop: 4, marginHorizontal: 20, letterSpacing: 0.2,
  },
  aboutVersionLine: {
    color: '#AEAEB2', fontSize: 13, marginTop: 8, marginHorizontal: 20,
  },
  aboutBuildLine: {
    color: '#8E8E93', fontSize: 12, marginTop: 4, marginHorizontal: 20, marginBottom: 16,
  },
  aboutIntro: {
    color: '#3C3C43', fontSize: 15, lineHeight: 23,
    marginHorizontal: 20, marginBottom: 8,
  },
  aboutTextBlock: {
    marginHorizontal: 20, marginTop: 20,
  },
  aboutBlockTitle: {
    color: '#1A1A1A', fontSize: 15, fontWeight: '600', marginBottom: 6,
  },
  aboutBlockBody: {
    color: '#48484A', fontSize: 15, lineHeight: 22,
  },
  featureRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 12, gap: 10,
  },
  featureBullet: {
    color: '#8E8E93', fontSize: 15, lineHeight: 22, marginTop: 1,
  },
  featureText: {
    flex: 1, color: '#3C3C43', fontSize: 15, lineHeight: 22,
  },
  aboutGroupLabel: {
    fontSize: 13, fontWeight: '400', color: '#8E8E93',
    marginLeft: 20, marginBottom: 8, textTransform: 'uppercase',
  },
  aboutGroupCard: {
    backgroundColor: '#FFF', marginHorizontal: 16, borderRadius: 12,
    marginBottom: 24, overflow: 'hidden',
  },
  devRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  devRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA',
  },
  devName: { color: '#1A1A1A', fontSize: 16, fontWeight: '400' },
  devRole: { color: '#8E8E93', fontSize: 15 },
  supportRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  supportLabel: { color: '#1A1A1A', fontSize: 16 },
  supportValue: { color: '#007AFF', fontSize: 15 },
  aboutMadeIn: {
    textAlign: 'center', color: '#AEAEB2', fontSize: 12,
    marginHorizontal: 20, marginTop: 16,
  },
  aboutCopyright: {
    textAlign: 'center', color: '#8E8E93', fontSize: 13,
    marginHorizontal: 20, marginTop: 6,
  },

  legalContainer: { flex: 1, backgroundColor: '#FFF' },
  legalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#E0E0E0',
  },
  legalTitle: { color: '#1A1A1A', fontSize: 17, fontWeight: '700' },
  legalBlock: { marginBottom: 20 },
  legalHeading: { color: '#1A1A1A', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  legalBody: { color: '#666', fontSize: 14, lineHeight: 21 },
  legalWebBtn: {
    marginTop: 8, paddingVertical: 14, alignItems: 'center',
    backgroundColor: '#F5F5F5', borderRadius: 12,
  },
  legalWebText: { color: '#007AFF', fontSize: 14, fontWeight: '500' },

  ratesContainer: { flex: 1, backgroundColor: '#F2F2F7' },
  ratesHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#C6C6C8',
  },
  ratesTitle: { color: '#1A1A1A', fontSize: 17, fontWeight: '600' },
  ratesHint: { color: '#666', fontSize: 14, lineHeight: 21, marginBottom: 20 },
  ratesLabel: { color: '#1A1A1A', fontSize: 15, fontWeight: '600', marginBottom: 8 },
  ratesInput: {
    backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 18, fontWeight: '600', color: '#1A1A1A',
    borderWidth: 1, borderColor: '#E5E5EA',
  },
  ratesBeans: { color: '#FF9500', fontSize: 13, fontWeight: '600', marginTop: 6 },
  ratesSaveBtn: {
    marginTop: 28, backgroundColor: '#FF2D55', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  ratesSaveText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});