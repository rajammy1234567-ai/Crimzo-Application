import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PRIVACY_URL, TERMS_URL } from '../../lib/apiClient';

export default function SettingsScreen() {
  const { logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cacheCleared, setCacheCleared] = useState(false);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
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
    Alert.alert('Clear Cache', 'Clear app cache to free up space?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        onPress: () => {
          setCacheCleared(true);
          Alert.alert('Done', 'Cache cleared successfully.');
        },
      },
    ]);
  };

  const openURL = async (url: string) => {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      Linking.openURL(url);
    } else {
      Alert.alert('Error', 'Unable to open link. Please try again later.');
    }
  };

  const sections: { title: string; items: { icon: string; iconColor: string; label: string; value?: string; valueColor?: string; onPress: () => void }[] }[] = [
    {
      title: 'Account',
      items: [
        {
          icon: 'language-outline', iconColor: '#9333EA',
          label: 'App Language', value: 'Automatic',
          onPress: () => Alert.alert('Language', 'Language selection coming soon.'),
        },
        {
          icon: 'ban-outline', iconColor: '#FF3B30',
          label: 'Blacklist',
          onPress: () => Alert.alert('Blacklist', 'You have no blocked users.'),
        },
      ],
    },
    {
      title: 'Legal',
      items: [
        {
          icon: 'shield-checkmark-outline', iconColor: '#34C759',
          label: 'Privacy Policy',
          onPress: () => openURL(PRIVACY_URL),
        },
        {
          icon: 'document-text-outline', iconColor: '#007AFF',
          label: 'User Agreement',
          onPress: () => openURL(TERMS_URL),
        },
      ],
    },
    {
      title: 'App',
      items: [
        {
          icon: 'information-circle-outline', iconColor: '#FF9500',
          label: 'About Us',
          onPress: () => Alert.alert('About Crimzo', 'Crimzo v4.0.1\n\nConnect, Stream, Share.\nBringing people together through live streaming.\n\nSupport: support@crimzo.app'),
        },
        {
          icon: 'star-outline', iconColor: '#FFD700',
          label: 'Rate Crimzo',
          onPress: () => Alert.alert('Rate Us', 'Thank you for using Crimzo!\n\nPlease rate us on the Play Store. Your feedback helps us improve.'),
        },
        {
          icon: 'trash-outline', iconColor: '#FF3B30',
          label: 'Clear Cache', value: cacheCleared ? '0 MB' : '99.4 MB',
          onPress: handleClearCache,
        },
        {
          icon: 'phone-portrait-outline', iconColor: '#9333EA',
          label: 'Version', value: '4.0.1',
          valueColor: '#9333EA',
          onPress: () => Alert.alert('Version', 'Crimzo v4.0.1\n\nYou are on the latest version.'),
        },
        {
          icon: 'headset-outline', iconColor: '#007AFF',
          label: 'Customer Service',
          onPress: () => Alert.alert('Customer Service', 'Email us at:\nsupport@crimzo.app\n\nWe typically respond within 24 hours.'),
        },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F5F5" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {sections.map((section, si) => (
          <View key={si} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.menuContainer}>
              {section.items.map((item, ii) => (
                <TouchableOpacity
                  key={ii}
                  style={[styles.menuItem, ii < section.items.length - 1 && styles.menuItemBorder]}
                  onPress={item.onPress}
                  activeOpacity={0.6}
                >
                  <View style={[styles.iconBox, { backgroundColor: item.iconColor + '15' }]}>
                    <Ionicons name={item.icon as any} size={18} color={item.iconColor} />
                  </View>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <View style={styles.menuRight}>
                    {item.value !== undefined && (
                      <Text style={[styles.menuValue, item.valueColor ? { color: item.valueColor } : {}]}>
                        {item.value}
                      </Text>
                    )}
                    <Ionicons name="chevron-forward" size={18} color="#C0C0C0" />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>Crimzo © 2025. All rights reserved.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E0E0E0',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#1A1A1A', fontSize: 17, fontWeight: '700' },

  scroll: { flex: 1 },

  section: { marginTop: 20 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#888',
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginLeft: 20, marginBottom: 6,
  },
  menuContainer: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  menuItemBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#F0F0F0',
  },
  iconBox: {
    width: 34, height: 34, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  menuLabel: { color: '#1A1A1A', fontSize: 15, fontWeight: '500', flex: 1 },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuValue: { color: '#999', fontSize: 14, fontWeight: '500' },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.2)',
  },
  logoutText: { color: '#FF3B30', fontSize: 16, fontWeight: '600' },

  footerText: {
    textAlign: 'center', color: '#C0C0C0', fontSize: 12,
    marginTop: 20,
  },
});
