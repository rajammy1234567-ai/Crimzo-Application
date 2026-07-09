import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Text, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { reelStudioColors } from './reelStudioTheme';

const { width: SCREEN_W } = Dimensions.get('window');
const SLIDER_W = SCREEN_W - 32;
const BAR_WIDTH = 4;
const BAR_MARGIN = 2;
const ITEM_WIDTH = BAR_WIDTH + BAR_MARGIN;
const NUM_BARS = 60;
const CONTENT_W = NUM_BARS * ITEM_WIDTH;

type Props = {
  durationMs: number;
  onScrubStart: () => void;
  onScrubEnd: (startMs: number) => void;
};

export default function AudioTrimmer({ durationMs, onScrubStart, onScrubEnd }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Fake waveform data
  const waveform = useRef(Array.from({ length: NUM_BARS }, () => 10 + Math.random() * 30)).current;
  
  const handleScrollBegin = () => {
    if (scrubTimer.current) clearTimeout(scrubTimer.current);
    onScrubStart();
  };
  
  const handleScrollEnd = (e: any) => {
    const x = Math.max(0, e.nativeEvent.contentOffset.x);
    if (scrubTimer.current) clearTimeout(scrubTimer.current);
    scrubTimer.current = setTimeout(() => {
      const progress = Math.min(1, x / (CONTENT_W - SLIDER_W / 2));
      const maxStartMs = Math.max(0, durationMs - 15000); 
      const startMs = Math.min(maxStartMs, progress * durationMs);
      onScrubEnd(startMs);
    }, 400); // 400ms debounce
  };
  
  return (
    <View style={s.container}>
      <Text style={s.label}>Trim Audio</Text>
      <View style={s.trackContainer}>
        {/* Playhead Indicator */}
        <View style={s.playhead} />
        
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={handleScrollBegin}
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={handleScrollEnd}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingHorizontal: SLIDER_W / 2, // Center playhead
            alignItems: 'center'
          }}
        >
          {waveform.map((h, i) => (
            <View key={i} style={[s.bar, { height: h }]} />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    marginTop: 8,
  },
  label: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
  trackContainer: {
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center'
  },
  bar: {
    width: BAR_WIDTH,
    backgroundColor: reelStudioColors.primary,
    marginRight: BAR_MARGIN,
    borderRadius: 2,
    opacity: 0.8,
  },
  playhead: {
    position: 'absolute',
    left: SLIDER_W / 2,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#FFF',
    zIndex: 10,
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  }
});
