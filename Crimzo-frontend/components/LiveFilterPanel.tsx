import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LIVE_FILTERS,
  type LiveFilterId,
} from '../lib/liveFilters';

interface LiveFilterPanelProps {
  visible: boolean;
  selectedId: LiveFilterId;
  onSelect: (id: LiveFilterId) => void;
  onClose: () => void;
}

export default function LiveFilterPanel({
  visible,
  selectedId,
  onSelect,
  onClose,
}: LiveFilterPanelProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>Live Filters</Text>
          <Text style={styles.subtitle}>Tap a filter — viewers see it on your stream</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
          >
            {LIVE_FILTERS.map((filter) => {
              const active = filter.id === selectedId;
              return (
                <TouchableOpacity
                  key={filter.id}
                  style={[styles.item, active && styles.itemActive]}
                  onPress={() => onSelect(filter.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.swatch, { backgroundColor: filter.swatch }, active && styles.swatchActive]}>
                    <Ionicons
                      name={filter.icon as keyof typeof Ionicons.glyphMap}
                      size={18}
                      color={active ? '#FFF' : 'rgba(255,255,255,0.85)'}
                    />
                  </View>
                  <Text style={[styles.label, active && styles.labelActive]}>{filter.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#0D0D14',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 18,
  },
  row: {
    paddingHorizontal: 4,
    gap: 12,
    paddingBottom: 8,
  },
  item: {
    alignItems: 'center',
    width: 72,
  },
  itemActive: {},
  swatch: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 8,
  },
  swatchActive: {
    borderColor: '#FF2D55',
    borderWidth: 3,
  },
  label: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  labelActive: {
    color: '#FF6B8A',
    fontWeight: '800',
  },
  doneBtn: {
    marginTop: 14,
    backgroundColor: 'rgba(255,45,85,0.15)',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,45,85,0.3)',
  },
  doneText: {
    color: '#FF6B8A',
    fontSize: 15,
    fontWeight: '800',
  },
});