import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import CrimzoNavLogo from './CrimzoNavLogo';
import { colors } from '../../lib/theme';

interface Props {
  username: string;
  onlineCount: number;
  notificationCount?: number;
  onSearch?: () => void;
  onNotification?: () => void;
}

const HomeHeader: React.FC<Props> = ({
  onlineCount,
  notificationCount = 0,
  onSearch,
  onNotification,
}) => {
  const handleSearch = () => {
    if (onSearch) onSearch();
  };

  const handleNotification = () => {
    if (onNotification) {
      onNotification();
    } else {
      Alert.alert('Notifications', 'You have no new notifications.');
    }
  };

  return (
    <View style={s.wrap}>
      <LinearGradient
        colors={['rgba(255,45,85,0.12)', 'rgba(255,45,85,0.02)', 'transparent']}
        style={s.glow}
      />
      <View style={s.header}>
        <View style={s.left}>
          <CrimzoNavLogo />
        </View>

        <View style={s.right}>
          {onlineCount > 0 && (
            <View style={s.onlinePill}>
              <View style={s.greenDot} />
              <Text style={s.onlineText}>{onlineCount.toLocaleString()} online</Text>
            </View>
          )}

          <TouchableOpacity style={s.iconBtn} onPress={handleNotification} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={20} color="rgba(255,255,255,0.9)" />
            {notificationCount > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.iconBtn} onPress={handleSearch} activeOpacity={0.7}>
            <Ionicons name="search-outline" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  wrap: {
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    backgroundColor: 'rgba(6,6,15,0.72)',
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 60,
  },
  left: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    minWidth: 0,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(76,217,100,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(76,217,100,0.22)',
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  onlineText: { color: colors.success, fontSize: 11, fontWeight: '700' },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
});

export default HomeHeader;