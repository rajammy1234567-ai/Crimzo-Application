import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export type PaymentMethodInfo = {
  type: 'bank' | 'upi' | 'card';
  status: 'pending' | 'verified';
  account_holder_name?: string | null;
  linked_phone?: string | null;
  bank_name?: string | null;
  account_last4?: string | null;
  ifsc?: string | null;
  upi_id?: string | null;
  card_last4?: string | null;
  display?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  busy?: boolean;
  existing?: PaymentMethodInfo | null;
  onSetup: (data: {
    type: 'bank' | 'upi' | 'card';
    account_holder_name: string;
    linked_phone: string;
    account_number?: string;
    ifsc?: string;
    upi_id?: string;
  }) => Promise<{ success: boolean; devHint?: string; emailMasked?: string; phoneMasked?: string }>;
  onVerifyOtp: (otp: string) => Promise<boolean>;
  onResendOtp: () => Promise<{ devHint?: string } | void>;
  onRemove: () => Promise<void>;
};

type Step = 'choose' | 'details' | 'otp' | 'verified';

export default function SetupPaymentModal({
  visible,
  onClose,
  busy,
  existing,
  onSetup,
  onVerifyOtp,
  onResendOtp,
  onRemove,
}: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [payType, setPayType] = useState<'bank' | 'upi' | 'card'>('bank');
  const [holder, setHolder] = useState('');
  const [phone, setPhone] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upi, setUpi] = useState('');
  const [otp, setOtp] = useState('');
  const [devHint, setDevHint] = useState('');
  const [emailMasked, setEmailMasked] = useState('');

  useEffect(() => {
    if (!visible) return;
    if (existing?.status === 'verified') {
      setStep('verified');
    } else if (existing?.status === 'pending') {
      setStep('otp');
      setPayType(existing.type || 'bank');
    } else {
      setStep('choose');
      setOtp('');
      setDevHint('');
    }
  }, [visible, existing]);

  const resetForm = () => {
    setStep('choose');
    setHolder('');
    setPhone('');
    setAccount('');
    setIfsc('');
    setUpi('');
    setOtp('');
    setDevHint('');
  };

  const handleSetup = async () => {
    const res = await onSetup({
      type: payType,
      account_holder_name: holder.trim(),
      linked_phone: phone.replace(/\D/g, '').slice(-10),
      account_number: payType === 'bank' ? account.replace(/\D/g, '') : undefined,
      ifsc: payType === 'bank' ? ifsc.trim().toUpperCase() : undefined,
      upi_id: payType === 'upi' ? upi.trim().toLowerCase() : undefined,
    });
    if (res.success) {
      setDevHint(res.devHint || '');
      setEmailMasked(res.emailMasked || 'your email');
      setStep('otp');
    }
  };

  const handleVerify = async () => {
    const ok = await onVerifyOtp(otp.trim());
    if (ok) {
      setStep('verified');
      onClose();
    }
  };

  const stepTitle = {
    choose: 'Add Money — Step 1 of 3',
    details: payType === 'upi' ? 'Link UPI — Step 2 of 3' : payType === 'card' ? 'Link Card — Step 2 of 3' : 'Link Bank — Step 2 of 3',
    otp: 'Verify OTP — Step 3 of 3',
    verified: 'Payment Method',
  }[step];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <View style={s.sheet} onStartShouldSetResponder={() => true}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.handle} />
            <Text style={s.title}>{stepTitle}</Text>

            {step === 'choose' && (
              <>
                <Text style={s.sub}>Pehle apna payment method verify karo. Uske baad hi paise add ho sakte hain.</Text>
                <TouchableOpacity
                  style={[s.choice, payType === 'bank' && s.choiceOn]}
                  onPress={() => setPayType('bank')}
                >
                  <Ionicons name="business" size={28} color={payType === 'bank' ? '#4CD964' : '#888'} />
                  <View style={s.choiceText}>
                    <Text style={s.choiceTitle}>Bank Account</Text>
                    <Text style={s.choiceSub}>Account + IFSC → OTP verify</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.choice, payType === 'upi' && s.choiceOn]}
                  onPress={() => setPayType('upi')}
                >
                  <Ionicons name="phone-portrait" size={28} color={payType === 'upi' ? '#4CD964' : '#888'} />
                  <View style={s.choiceText}>
                    <Text style={s.choiceTitle}>UPI</Text>
                    <Text style={s.choiceSub}>GPay, PhonePe — OTP on linked mobile</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.choice, payType === 'card' && s.choiceOn]}
                  onPress={() => setPayType('card')}
                >
                  <Ionicons name="card" size={28} color={payType === 'card' ? '#4CD964' : '#888'} />
                  <View style={s.choiceText}>
                    <Text style={s.choiceTitle}>Debit / Credit Card</Text>
                    <Text style={s.choiceSub}>Card + mobile OTP verify</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setStep('details')} activeOpacity={0.85}>
                  <LinearGradient colors={['#4CD964', '#30D158']} style={s.btn}>
                    <Text style={s.btnText}>Continue</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFF" />
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {step === 'details' && (
              <>
                <Text style={s.sub}>
                  {payType === 'upi'
                    ? 'UPI ID daalo — hum OTP bhejenge verify karne ke liye'
                    : 'Bank details daalo — hum OTP bhejenge account verify karne ke liye'}
                </Text>
                <Text style={s.label}>Full name</Text>
                <TextInput
                  style={s.input}
                  placeholder="Bank/UPI par jo naam hai"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={holder}
                  onChangeText={setHolder}
                />
                <Text style={s.label}>Linked mobile (10 digits)</Text>
                <TextInput
                  style={s.input}
                  keyboardType="phone-pad"
                  placeholder="Bank/UPI linked number"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={phone}
                  onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, '').slice(0, 10))}
                  maxLength={10}
                />
                {payType === 'bank' ? (
                  <>
                    <Text style={s.label}>Account number</Text>
                    <TextInput
                      style={s.input}
                      keyboardType="number-pad"
                      placeholder="9–18 digits"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={account}
                      onChangeText={(t) => setAccount(t.replace(/[^0-9]/g, ''))}
                      maxLength={18}
                    />
                    <Text style={s.label}>IFSC code</Text>
                    <TextInput
                      style={s.input}
                      autoCapitalize="characters"
                      placeholder="HDFC0001234"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={ifsc}
                      onChangeText={(t) => setIfsc(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      maxLength={11}
                    />
                  </>
                ) : payType === 'upi' ? (
                  <>
                    <Text style={s.label}>UPI ID</Text>
                    <TextInput
                      style={s.input}
                      autoCapitalize="none"
                      placeholder="yourname@paytm / @ybl / @oksbi"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={upi}
                      onChangeText={setUpi}
                    />
                  </>
                ) : (
                  <Text style={s.cardNote}>
                    Card number secure Razorpay par save hoga jab pehli payment karoge. Ab sirf naam + mobile verify.
                  </Text>
                )}
                <TouchableOpacity onPress={handleSetup} disabled={busy} activeOpacity={0.85}>
                  <LinearGradient colors={busy ? ['#555', '#444'] : ['#FF2D55', '#FF6B8A']} style={s.btn}>
                    {busy ? <ActivityIndicator color="#FFF" /> : (
                      <>
                        <Ionicons name="mail" size={18} color="#FFF" />
                        <Text style={s.btnText}>Send OTP to Email</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setStep('choose')} style={s.backBtn}>
                  <Text style={s.backText}>← Back</Text>
                </TouchableOpacity>
              </>
            )}

            {step === 'otp' && (
              <>
                <Text style={s.sub}>
                  OTP bheja gaya: {emailMasked || 'your registered email'}
                </Text>
                {devHint ? (
                  <View style={s.devBox}>
                    <Text style={s.devText}>{devHint}</Text>
                  </View>
                ) : null}
                <Text style={s.label}>6-digit OTP</Text>
                <TextInput
                  style={[s.input, s.otpInput]}
                  keyboardType="number-pad"
                  placeholder="• • • • • •"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={otp}
                  onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, '').slice(0, 6))}
                  maxLength={6}
                />
                <TouchableOpacity onPress={handleVerify} disabled={busy || otp.length < 6} activeOpacity={0.85}>
                  <LinearGradient colors={busy ? ['#555', '#444'] : ['#4CD964', '#30D158']} style={s.btn}>
                    {busy ? <ActivityIndicator color="#FFF" /> : (
                      <Text style={s.btnText}>Verify & Activate</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    const r = await onResendOtp();
                    if (r?.devHint) setDevHint(r.devHint);
                  }}
                  disabled={busy}
                  style={s.backBtn}
                >
                  <Text style={s.resend}>Resend OTP</Text>
                </TouchableOpacity>
              </>
            )}

            {step === 'verified' && existing && (
              <>
                <View style={s.verifiedCard}>
                  <Ionicons name="checkmark-circle" size={32} color="#4CD964" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.verifiedTitle}>Verified ✓</Text>
                    <Text style={s.verifiedDisplay}>{existing.display}</Text>
                    <Text style={s.verifiedName}>{existing.account_holder_name}</Text>
                  </View>
                </View>
                <Text style={s.sub}>Ab aap Add Money kar sakte ho — paise isi se cut honge.</Text>
                <TouchableOpacity
                  onPress={async () => { await onRemove(); resetForm(); }}
                  style={s.backBtn}
                >
                  <Text style={s.unlink}>Change payment method</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} activeOpacity={0.85}>
                  <LinearGradient colors={['#4CD964', '#30D158']} style={s.btn}>
                    <Text style={s.btnText}>Done</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 36,
    maxHeight: '92%',
  },
  handle: {
    width: 44, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginBottom: 16,
  },
  title: { color: '#FFF', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  sub: {
    color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center',
    marginTop: 10, marginBottom: 18, lineHeight: 18,
  },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderRadius: 16, marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  choiceOn: { borderColor: '#4CD964', backgroundColor: 'rgba(76,217,100,0.08)' },
  choiceText: { flex: 1 },
  choiceTitle: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  choiceSub: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 },
  label: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14, color: '#FFF', fontSize: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  otpInput: { textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: '800' },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 16, marginTop: 18,
  },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  backBtn: { alignItems: 'center', marginTop: 14 },
  backText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  resend: { color: '#FF2D55', fontSize: 14, fontWeight: '700' },
  devBox: {
    backgroundColor: 'rgba(255,149,0,0.15)', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,149,0,0.3)', marginBottom: 8,
  },
  devText: { color: '#FF9500', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  verifiedCard: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    backgroundColor: 'rgba(76,217,100,0.1)', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(76,217,100,0.25)', marginBottom: 12,
  },
  verifiedTitle: { color: '#4CD964', fontSize: 14, fontWeight: '800' },
  verifiedDisplay: { color: '#FFF', fontSize: 16, fontWeight: '800', marginTop: 4 },
  verifiedName: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 },
  unlink: { color: '#FF2D55', fontSize: 13, fontWeight: '700' },
  cardNote: {
    color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 18,
    marginTop: 12, marginBottom: 4,
  },
});