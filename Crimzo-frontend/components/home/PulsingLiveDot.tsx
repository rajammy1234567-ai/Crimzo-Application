import React, { useRef, useEffect } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';

const PulsingLiveDot: React.FC = () => {
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const opacityAnim = useRef(new Animated.Value(0.6)).current;

    useEffect(() => {
        Animated.loop(
            Animated.parallel([
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.8, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                ]),
                Animated.sequence([
                    Animated.timing(opacityAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
                    Animated.timing(opacityAnim, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
                ]),
            ])
        ).start();
    }, []);

    return (
        <View style={styles.container}>
            <Animated.View
                style={[
                    styles.pulse,
                    { transform: [{ scale: pulseAnim }], opacity: opacityAnim },
                ]}
            />
            <View style={styles.dot} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { position: 'absolute', top: -2, right: -2, width: 16, height: 16, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
    pulse: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: '#FF2D55' },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF2D55', borderWidth: 1.5, borderColor: '#000' },
});

export default PulsingLiveDot;
