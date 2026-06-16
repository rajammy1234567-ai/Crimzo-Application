import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  username: string;
  onlineCount: number;
  notificationCount?: number;
  onSearch?: () => void;
  onNotification?: () => void;
}

const HomeHeader: React.FC<Props> = ({
  username,
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
    <View style={s.header}>
      {/* Left: Logo + greeting */}
      <View style={s.left}>
        <Image
          source={require('../../assets/images/crimzo_logo1.png')}
          style={s.logo}
          resizeMode="contain"
        />
      </View>

      {/* Right: Online badge + action buttons */}
      <View style={s.right}>
        {onlineCount > 0 && (
          <View style={s.onlinePill}>
            <View style={s.greenDot} />
            <Text style={s.onlineText}>{onlineCount.toLocaleString()} online</Text>
          </View>
        )}

        {/* Notification button */}
        <TouchableOpacity style={s.iconBtn} onPress={handleNotification} activeOpacity={0.7}>
          <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.85)" />
          {notificationCount > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Search button */}
        <TouchableOpacity style={s.iconBtn} onPress={handleSearch} activeOpacity={0.7}>
          <Ionicons name="search-outline" size={22} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 110,
    height: 36,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(76,217,100,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(76,217,100,0.15)',
  },
  greenDot: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: '#4CD964',
  },
  onlineText: { color: '#4CD964', fontSize: 11, fontWeight: '700' },
  iconBtn: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute', top: -2, right: -2,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#FF2D55',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: '#000',
  },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
});

export default HomeHeader;
