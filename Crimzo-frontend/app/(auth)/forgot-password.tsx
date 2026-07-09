import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, ActivityIndicator, Animated, StatusBar, ScrollView, Easing, Image } from 'react-native';
import { useRouter as useExpoRouter } from 'expo-router';
import { KEYBOARD_BEHAVIOR } from '../../components/KeyboardAware';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { apiPost } from '../../lib/apiClient';
import { appAlert } from '../../lib/appAlert';

export default function ForgotPasswordScreen() {
  const router = useExpoRouter();
  const [loginId, setLoginId] = useState('');
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const handleRequestOtp = async () => {
    if (method === 'email') {
      if (!loginId.trim() || !loginId.includes('@')) {
        return appAlert('Invalid', 'Please enter a valid email address.');
      }
    } else {
      if (!loginId || loginId.length !== 10 || !/^\d{10}$/.test(loginId)) {
        return appAlert('Invalid Number', 'Please enter a valid 10-digit mobile number.');
      }
    }
    
    setLoading(true);
    try {
      const res = await apiPost<{ devOtp?: string }>('/api/auth/forgot-password/send-otp', { loginId });
      setStep('reset');
      if (res && res.devOtp) {
        console.log('--- OTP (TEST) ---:', res.devOtp);
        appAlert(
          '💬 New Message',
          `Crimzo: Your verification code is ${res.devOtp}. Do not share this with anyone.`,
          [
            { text: 'Auto-fill', onPress: () => setOtp(res.devOtp!) },
            { text: 'Dismiss', style: 'cancel' }
          ]
        );
      } else {
        appAlert('Code Sent', 'Please check your email or WhatsApp for the reset code.');
      }
    } catch (err: any) {
      appAlert('Error', err.message || 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!otp.trim() || !newPassword.trim()) {
      return appAlert('Required', 'Please fill all fields.');
    }
    if (newPassword.length < 6) {
      return appAlert('Invalid', 'Password must be at least 6 characters.');
    }
    if (newPassword !== confirmPassword) {
      return appAlert('Mismatch', 'Passwords do not match.');
    }
    setLoading(true);
    try {
      await apiPost('/api/auth/forgot-password/reset', { loginId, otp, newPassword });
      appAlert('Success', 'Your password has been reset successfully. Please login.');
      router.replace('/(auth)/login' as never);
    } catch (err: any) {
      appAlert('Error', err.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient colors={['#0a0a12', '#0e0e1a', '#0a0a12']} style={StyleSheet.absoluteFillObject} />

      <KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR} style={s.keyboardView}>
        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <View style={s.backBtnInner}>
              <Ionicons name="arrow-back" size={22} color="#FFF" />
            </View>
          </TouchableOpacity>

          <Animated.View style={[s.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <View style={s.card}>
              <Text style={s.cardTitle}>Reset Password</Text>
              <Text style={s.cardSub}>
                {step === 'request' 
                  ? 'Enter your registered email or WhatsApp number to receive a reset code.' 
                  : 'Enter the verification code and your new password.'}
              </Text>

              {step === 'request' ? (
                <>
                  <View style={s.toggleWrap}>
                    <TouchableOpacity style={[s.toggleBtn, method === 'email' && s.toggleBtnActive]} onPress={() => { setMethod('email'); setLoginId(''); }}>
                      <Text style={[s.toggleText, method === 'email' && s.toggleTextActive]}>Email</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.toggleBtn, method === 'phone' && s.toggleBtnActive]} onPress={() => { setMethod('phone'); setLoginId(''); }}>
                      <Text style={[s.toggleText, method === 'phone' && s.toggleTextActive]}>Phone</Text>
                    </TouchableOpacity>
                  </View>

                  {method === 'email' ? (
                    <View style={s.inputWrap}>
                      <Ionicons name="mail-outline" size={18} color="rgba(255,255,255,0.35)" style={s.inputIcon} />
                      <TextInput
                        style={s.input}
                        placeholder="Email Address"
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        value={loginId}
                        onChangeText={setLoginId}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        selectionColor="#FF2D55"
                      />
                    </View>
                  ) : (
                    <View style={s.inputWrap}>
                      <Ionicons name="call-outline" size={18} color="rgba(255,255,255,0.35)" style={s.inputIcon} />
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 12 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15, marginRight: 8, fontWeight: 'bold' }}>+91</Text>
                        <View style={{ width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                      </View>
                      <TextInput
                        style={s.input}
                        placeholder="Mobile Number"
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        value={loginId}
                        onChangeText={(t) => setLoginId(t.replace(/[^0-9]/g, '').slice(0, 10))}
                        keyboardType="phone-pad"
                        maxLength={10}
                        selectionColor="#FF2D55"
                      />
                    </View>
                  )}

                  <TouchableOpacity style={s.btnWrap} onPress={handleRequestOtp} disabled={loading} activeOpacity={0.8}>
                    <LinearGradient colors={['#FF2D55', '#FF4B6F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btnGradient}>
                      {loading ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnText}>Send Reset Code</Text>}
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={s.inputWrap}>
                    <Ionicons name="keypad-outline" size={18} color="rgba(255,255,255,0.35)" style={s.inputIcon} />
                    <TextInput
                      style={s.input}
                      placeholder="Enter 6-digit Code"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={otp}
                      onChangeText={setOtp}
                      keyboardType="number-pad"
                      selectionColor="#FF2D55"
                    />
                  </View>
                  <View style={s.inputWrap}>
                    <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.35)" style={s.inputIcon} />
                    <TextInput
                      style={s.input}
                      placeholder="New Password"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showPassword}
                      selectionColor="#FF2D55"
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="rgba(255,255,255,0.4)" />
                    </TouchableOpacity>
                  </View>
                  <View style={s.inputWrap}>
                    <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.35)" style={s.inputIcon} />
                    <TextInput
                      style={s.input}
                      placeholder="Confirm New Password"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                      selectionColor="#FF2D55"
                    />
                  </View>

                  <TouchableOpacity style={s.btnWrap} onPress={handleResetPassword} disabled={loading} activeOpacity={0.8}>
                    <LinearGradient colors={['#FF2D55', '#FF4B6F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btnGradient}>
                      {loading ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnText}>Update Password</Text>}
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              )}
            </View>
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
  backBtn: { position: 'absolute', top: 56, left: 16, zIndex: 10 },
  backBtnInner: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 24, alignItems: 'center' },
  card: { width: '100%', backgroundColor: 'rgba(18,18,28,0.9)', borderRadius: 28, padding: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  cardTitle: { fontSize: 24, fontWeight: '800', color: '#FFF', marginBottom: 6 },
  cardSub: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 22, lineHeight: 20 },
  toggleWrap: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 4, marginBottom: 20 },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
  toggleBtnActive: { backgroundColor: 'rgba(255,45,85,0.15)' },
  toggleText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
  toggleTextActive: { color: '#FF2D55' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', height: 56, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 14, overflow: 'hidden' },
  inputIcon: { marginLeft: 16 },
  input: { flex: 1, color: '#FFF', fontSize: 15, paddingHorizontal: 12, fontWeight: '500' },
  eyeBtn: { paddingHorizontal: 14 },
  btnWrap: { width: '100%', height: 56, borderRadius: 18, overflow: 'hidden', marginTop: 10, shadowColor: '#FF2D55', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  btnGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  btnText: { color: '#FFF', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
});
