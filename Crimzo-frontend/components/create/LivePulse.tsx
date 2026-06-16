import React, { useRef, useEffect } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';

const LivePulse = React.memo(() => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const opacAnim = useRef(new Animated.Value(0.5)).current;

    useEffect(() => {
        Animated.loop(
            Animated.parallel([
                Animated.sequence([
                    Animated.timing(scaleAnim, { toValue: 1.6, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
                    Animated.timing(scaleAnim, { toValue: 1, duration: 1200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
                ]),
                Animated.sequence([
                    Animated.timing(opacAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
                    Animated.timing(opacAnim, { toValue: 0.5, duration: 1200, useNativeDriver: true }),
                ]),
            ])
        ).start();
    }, []);

    return (
        <Animated.View style={{
            position: 'absolute',
            width: 64, height: 64, borderRadius: 32,
            backgroundColor: '#FF2D55',
            transform: [{ scale: scaleAnim }],
            opacity: opacAnim,
        }} />
    );
});

export default LivePulse;
