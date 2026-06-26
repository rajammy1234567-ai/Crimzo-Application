import React, { useState, useRef, useEffect } from 'react';
import { appAlert } from '../../lib/appAlert';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Animated, StatusBar, ScrollView, Image, Easing, Modal, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { KEYBOARD_BEHAVIOR } from '../../components/KeyboardAware';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { PRIVACY_URL, TERMS_URL } from '../../lib/apiClient';
import GoogleSignInButton from '../../components/auth/GoogleSignInButton';
import {
  formatReferralInviteCode,
  getPendingReferralCode,
  savePendingReferralCode,
} from '../../lib/referral';
import { resolvePostAuthRoute } from '../../lib/liveShare';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const [tempAvatarUri, setTempAvatarUri] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [referralId, setReferralId] = useState('');
  const { register } = useAuth();
  const router = useRouter();

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    getPendingReferralCode()
      .then((code) => {
        if (code) setReferralId(formatReferralInviteCode(code));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const trimmed = referralId.trim();
    if (!trimmed) return;
    savePendingReferralCode(trimmed).catch(() => {});
  }, [referralId]);

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

  const pickAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return appAlert('Permission Required', 'Please grant access to your photo library to set a profile photo.');
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]) {
        setTempAvatarUri(result.assets[0].uri);
        setShowAvatarPreview(true);
      }
    } catch (err) {
      console.error('Image picker error:', err);
    }
  };

  const confirmAvatar = () => {
    setAvatarUri(tempAvatarUri);
    setShowAvatarPreview(false);
    setTempAvatarUri(null);
  };

  const retakeAvatar = async () => {
    setShowAvatarPreview(false);
    setTempAvatarUri(null);
    setTimeout(() => pickAvatar(), 300);
  };

  const isValidEmail = (e: string) => /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(e);

  const handleRegister = async () => {
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedUsername || trimmedUsername.length < 3) {
      return appAlert('Invalid Username', 'Username must be at least 3 characters.');
    }
    if (/\s/.test(trimmedUsername)) {
      return appAlert('Invalid Username', 'Username cannot contain spaces.');
    }
    if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
      return appAlert('Invalid Email', 'Please enter a valid email address (e.g. user@gmail.com).');
    }
    if (!password || password.length < 6) {
      return appAlert('Weak Password', 'Password must be at least 6 characters.');
    }
    if (password !== confirmPassword) {
      return appAlert('Password Mismatch', 'The passwords you entered do not match.');
    }

    setLoading(true);
    try {
      if (referralId.trim()) {
        await savePendingReferralCode(referralId.trim());
      }
      await register(trimmedEmail, password, trimmedUsername, avatarUri || undefined);
      router.replace((await resolvePostAuthRoute()) as never);
    } catch (err: any) {
      appAlert('Registration Failed', err.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
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
          {/* Back */}
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <View style={s.backBtnInner}>
              <Ionicons name="arrow-back" size={22} color="#FFF" />
            </View>
          </TouchableOpacity>

          <Animated.View style={[s.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Logo */}
            <View style={s.logoSection}>
              <Animated.View style={[s.glowRing, { opacity: glowAnim }]} />
              <Image
                source={require('../../assets/images/crimzo_logo_header.png')}
                style={s.logoImg}
                resizeMode="contain"
              />
              <Text style={s.logoSub}>CREATE YOUR ACCOUNT</Text>
            </View>

            {/* Card */}
            <View style={s.card}>
              {/* Avatar Picker */}
              <TouchableOpacity style={s.avatarPicker} onPress={pickAvatar} activeOpacity={0.7}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={s.avatarImage} />
                ) : (
                  <View style={s.avatarPlaceholder}>
                    <Ionicons name="camera" size={28} color="rgba(255,255,255,0.4)" />
                  </View>
                )}
                <View style={s.avatarBadge}>
                  <Ionicons name="add" size={14} color="#FFF" />
                </View>
                <Text style={s.avatarLabel}>Profile Photo (Optional)</Text>
              </TouchableOpacity>

              {/* Username */}
              <View style={s.inputWrap}>
                <Ionicons name="person-outline" size={18} color="rgba(255,255,255,0.35)" style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="Username (min 3 chars, no spaces)"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={username}
                  onChangeText={(t) => setUsername(t.replace(/\s/g, ''))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  textContentType="username"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                  selectionColor="#FF2D55"
                />
              </View>

              {/* Email */}
              <View style={s.inputWrap}>
                <Ionicons name="mail-outline" size={18} color="rgba(255,255,255,0.35)" style={s.inputIcon} />
                <TextInput
                  ref={emailRef}
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
                  placeholder="Password (min 6 chars)"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  selectionColor="#FF2D55"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              </View>

              {/* Referral ID */}
              <View style={s.inputWrap}>
                <Ionicons name="gift-outline" size={18} color="rgba(255,255,255,0.35)" style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="Referral ID (e.g. CRIMZO-ABC123)"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={referralId}
                  onChangeText={(t) => setReferralId(t.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="next"
                  selectionColor="#FF2D55"
                />
              </View>

              {/* Confirm Password */}
              <View style={s.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.35)" style={s.inputIcon} />
                <TextInput
                  ref={confirmRef}
                  style={s.input}
                  placeholder="Confirm Password"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                  selectionColor="#FF2D55"
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={s.eyeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              </View>

              {/* Register Button */}
              <TouchableOpacity style={s.btnWrap} onPress={handleRegister} disabled={loading} activeOpacity={0.8}>
                <LinearGradient
                  colors={['#FF2D55', '#FF4B6F']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.btnGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <View style={s.btnRow}>
                      <Ionicons name="sparkles" size={19} color="#FFF" />
                      <Text style={s.btnText}>Create Account</Text>
                    </View>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <View style={s.dividerRow}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>or</Text>
                <View style={s.dividerLine} />
              </View>

              <GoogleSignInButton
                disabled={loading}
                onSuccess={async () => router.replace((await resolvePostAuthRoute()) as never)}
              />
            </View>

            <View style={s.footer}>
              <Text style={s.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={s.footerLink}>Sign In</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.terms}>
              {'By creating an account, you agree to Crimzo\'s\n'}
              <Text style={s.termsLink} onPress={() => Linking.openURL(TERMS_URL)}>Terms of Service</Text>
              {' & '}
              <Text style={s.termsLink} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy Policy</Text>
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Avatar Preview Modal */}
      <Modal visible={showAvatarPreview} animationType="fade" transparent statusBarTranslucent>
        <View style={s.avatarModalOverlay}>
          <View style={s.avatarModalContent}>
            <Text style={s.avatarModalTitle}>Profile Photo</Text>
            {tempAvatarUri && (
              <Image source={{ uri: tempAvatarUri }} style={s.avatarModalImage} />
            )}
            <View style={s.avatarModalActions}>
              <TouchableOpacity style={s.avatarModalBtn} onPress={retakeAvatar}>
                <Ionicons name="crop" size={20} color="#FF2D55" />
                <Text style={s.avatarModalBtnText}>Re-crop</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.avatarModalBtn, s.avatarModalDoneBtn]} onPress={confirmAvatar}>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={[s.avatarModalBtnText, { color: '#FFF' }]}>Done</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={s.avatarModalCancel}
              onPress={() => { setShowAvatarPreview(false); setTempAvatarUri(null); }}
            >
              <Text style={s.avatarModalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  backBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 56 : 44,
    left: 16, zIndex: 10,
  },
  backBtnInner: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },

  logoSection: { alignItems: 'center', marginBottom: 28, position: 'relative' },
  glowRing: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,45,85,0.08)',
    top: '50%', left: '50%',
    transform: [{ translateX: -80 }, { translateY: -80 }],
  },
  logoImg: { width: 300, height: 96, marginBottom: 14 },
  logoSub: {
    fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 3,
    marginTop: 6, fontWeight: '600',
  },

  card: {
    width: '100%', backgroundColor: 'rgba(18,18,28,0.9)',
    borderRadius: 28, padding: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },

  avatarPicker: { alignItems: 'center', marginBottom: 20, position: 'relative' },
  avatarImage: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#FF2D55' },
  avatarPlaceholder: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute', bottom: 18, right: '50%',
    marginRight: -45,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#FF2D55', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#0a0a12',
  },
  avatarLabel: {
    color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600', marginTop: 8,
  },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center', height: 54,
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12, overflow: 'hidden',
  },
  inputIcon: { marginLeft: 16 },
  input: { flex: 1, color: '#FFF', fontSize: 15, paddingHorizontal: 12, fontWeight: '500' },
  eyeBtn: { paddingHorizontal: 14 },

  btnWrap: {
    width: '100%', height: 56, borderRadius: 18, overflow: 'hidden', marginTop: 6,
    shadowColor: '#FF2D55', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  btnGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { color: '#FFF', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },

  dividerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: 18, marginBottom: 14,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerText: { color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: '600' },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 24,
  },
  footerText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  footerLink: { color: '#FF2D55', fontSize: 14, fontWeight: '700' },

  terms: {
    color: 'rgba(255,255,255,0.25)', fontSize: 11, textAlign: 'center',
    lineHeight: 18, marginTop: 16,
  },
  termsLink: { color: 'rgba(255,100,130,0.7)', fontWeight: '600', textDecorationLine: 'underline' },

  avatarModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarModalContent: {
    width: '80%', backgroundColor: '#1A1A24', borderRadius: 24,
    padding: 24, alignItems: 'center',
  },
  avatarModalTitle: {
    color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 20,
  },
  avatarModalImage: {
    width: 180, height: 180, borderRadius: 90,
    borderWidth: 3, borderColor: '#FF2D55', marginBottom: 24,
  },
  avatarModalActions: { flexDirection: 'row', gap: 12, width: '100%' },
  avatarModalBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: 14,
    backgroundColor: 'rgba(255,45,85,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,45,85,0.2)',
  },
  avatarModalDoneBtn: { backgroundColor: '#FF2D55', borderColor: '#FF2D55' },
  avatarModalBtnText: { color: '#FF2D55', fontSize: 15, fontWeight: '700' },
  avatarModalCancel: { marginTop: 16, paddingVertical: 8 },
  avatarModalCancelText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '600' },
});
