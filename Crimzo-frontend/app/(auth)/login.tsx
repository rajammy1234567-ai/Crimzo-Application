import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  Animated, StatusBar, ScrollView, Easing, Image, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { KEYBOARD_BEHAVIOR } from '../../components/KeyboardAware';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { PRIVACY_URL, TERMS_URL } from '../../lib/apiClient';
import GoogleSignInButton from '../../components/auth/GoogleSignInButton';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const isValidEmail = (e: string) => /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(e);

  const handleLogin = async () => {
    if (!email || !isValidEmail(email.trim())) {
      return Alert.alert('Invalid Email', 'Please enter a valid email address (e.g. user@gmail.com).');
    }
    if (!password || password.length < 6) {
      return Alert.alert('Invalid Password', 'Password must be at least 6 characters.');
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace('/(tabs)/home');
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    Alert.alert(
      'Forgot Password',
      'Please contact support at support@crimzo.com to reset your password.',
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <LinearGradient
        colors={['#0a0a12', '#0e0e1a', '#0a0a12']}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={s.accentCircle1} />
      <View style={s.accentCircle2} />

      <KeyboardAvoidingView
        behavior={KEYBOARD_BEHAVIOR}
        style={s.keyboardView}
      >
        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[s.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Logo */}
            <View style={s.logoSection}>
              <Animated.View style={[s.glowRing, { opacity: glowAnim }]} />
              <Image
                source={require('../../assets/images/crimzo_logo1.png')}
                style={s.logoImg}
                resizeMode="contain"
              />
              <Text style={s.logoSub}>WELCOME BACK</Text>
            </View>

            {/* Login Card */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Sign In</Text>
              <Text style={s.cardSub}>Enter your email and password to continue</Text>

              {/* Email */}
              <View style={s.inputWrap}>
                <Ionicons name="mail-outline" size={18} color="rgba(255,255,255,0.35)" style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="Email address"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  selectionColor="#FF2D55"
                />
              </View>

              {/* Password */}
              <View style={s.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.35)" style={s.inputIcon} />
                <TextInput
                  ref={passwordRef}
                  style={s.input}
                  placeholder="Password"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  selectionColor="#FF2D55"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              </View>

              {/* Login Button */}
              <TouchableOpacity style={s.btnWrap} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
                <LinearGradient
                  colors={['#FF2D55', '#FF4B6F']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.btnGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <View style={s.btnRow}>
                      <Ionicons name="log-in-outline" size={20} color="#FFF" />
                      <Text style={s.btnText}>Sign In</Text>
                    </View>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Forgot password */}
              <TouchableOpacity style={s.forgotBtn} onPress={handleForgotPassword}>
                <Text style={s.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>

              <View style={s.dividerRow}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>or</Text>
                <View style={s.dividerLine} />
              </View>

              <GoogleSignInButton
                disabled={loading}
                onSuccess={() => router.replace('/(tabs)/home')}
              />
            </View>

            <View style={s.footer}>
              <Text style={s.footerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                <Text style={s.footerLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.terms}>
              {'By continuing, you agree to Crimzo\'s\n'}
              <Text style={s.termsLink} onPress={() => Linking.openURL(TERMS_URL)}>Terms of Service</Text>
              {' & '}
              <Text style={s.termsLink} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy Policy</Text>
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08080C' },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingBottom: 32 },
  content: { paddingHorizontal: 24, alignItems: 'center' },

  accentCircle1: {
    position: 'absolute', top: -80, right: -60,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,45,85,0.06)',
  },
  accentCircle2: {
    position: 'absolute', bottom: -100, left: -80,
    width: 250, height: 250, borderRadius: 125,
    backgroundColor: 'rgba(124,77,255,0.04)',
  },

  logoSection: { alignItems: 'center', marginBottom: 40, position: 'relative' },
  glowRing: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,45,85,0.08)',
    top: '50%', left: '50%',
    transform: [{ translateX: -90 }, { translateY: -90 }],
  },
  logoImg: { width: 260, height: 110, marginBottom: 14 },
  logoSub: {
    fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: 4,
    marginTop: 8, fontWeight: '600',
  },

  card: {
    width: '100%', backgroundColor: 'rgba(18,18,28,0.9)',
    borderRadius: 28, padding: 28,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  cardTitle: { fontSize: 24, fontWeight: '800', color: '#FFF', marginBottom: 6 },
  cardSub: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 24, lineHeight: 20 },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center', height: 56,
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14, overflow: 'hidden',
  },
  inputIcon: { marginLeft: 16 },
  input: { flex: 1, color: '#FFF', fontSize: 15, paddingHorizontal: 12, fontWeight: '500' },
  eyeBtn: { paddingHorizontal: 14 },

  btnWrap: {
    width: '100%', height: 56, borderRadius: 18, overflow: 'hidden', marginTop: 4,
    shadowColor: '#FF2D55', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  btnGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { color: '#FFF', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },

  forgotBtn: { alignItems: 'center', marginTop: 16 },
  forgotText: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '600' },

  dividerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: 20, marginBottom: 16,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerText: { color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: '600' },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 28,
  },
  footerText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  footerLink: { color: '#FF2D55', fontSize: 14, fontWeight: '700' },

  terms: {
    color: 'rgba(255,255,255,0.25)', fontSize: 11, textAlign: 'center',
    lineHeight: 18, marginTop: 20,
  },
  termsLink: { color: 'rgba(255,100,130,0.7)', fontWeight: '600', textDecorationLine: 'underline' },
});
