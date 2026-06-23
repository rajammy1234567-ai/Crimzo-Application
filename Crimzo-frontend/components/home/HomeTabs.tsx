import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients } from '../../lib/theme';

interface Props {
  activeTab: string;
  onChangeTab: (tab: string) => void;
}

const TABS = [
  { key: 'for-you', label: 'Popular Live', icon: 'flame' as const },
  { key: 'gaming', label: 'PK Battles', icon: 'flash' as const },
];

const HomeTabs: React.FC<Props> = ({ activeTab, onChangeTab }) => (
  <View style={s.wrapper}>
    <View style={s.row}>
      {TABS.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={s.pillTouch}
            onPress={() => onChangeTab(tab.key)}
            activeOpacity={0.8}
          >
            {active ? (
              <LinearGradient
                colors={[...gradients.primaryWide]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.pillActive}
              >
                <Ionicons name={tab.icon} size={15} color="#FFF" />
                <Text style={s.pillTextActive}>{tab.label}</Text>
              </LinearGradient>
            ) : (
              <View style={s.pill}>
                <Ionicons
                  name={tab.icon === 'flame' ? 'flame-outline' : 'flash-outline'}
                  size={15}
                  color={colors.textMuted}
                />
                <Text style={s.pillText}>{tab.label}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

const s = StyleSheet.create({
  wrapper: { paddingBottom: 8, paddingTop: 4 },
  row: { flexDirection: 'row', paddingHorizontal: 14, gap: 10 },
  pillTouch: { flex: 1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  pillActive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 18,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  pillText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  pillTextActive: { color: '#FFF', fontSize: 13, fontWeight: '800' },
});

export default HomeTabs;