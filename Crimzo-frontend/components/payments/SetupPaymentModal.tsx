import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { KeyboardSheet } from '../KeyboardAware';
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

export default function SetupPaymentModal({
  visible,
  onClose,
  busy,
  existing,
  onSetup,
  onRemove,
}: Props) {
  const [holder, setHolder] = useState('');
  const [phone, setPhone] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');

  const isVerified = existing?.status === 'verified';

  useEffect(() => {
    if (!visible) {
      setHolder('');
      setPhone('');
      setAccount('');
      setIfsc('');
    }
  }, [visible]);

  const handleSetup = async () => {
    const res = await onSetup({
      type: 'bank',
      account_holder_name: holder.trim(),
      linked_phone: phone.replace(/\\D/g, '').slice(-10),
      account_number: account.replace(/\\D/g, ''),
      ifsc: ifsc.trim().toUpperCase(),
    });
    if (res.success) {
      onClose();
    }
  };

  return (
    <KeyboardSheet visible={visible} onClose={onClose}>
        <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.title}>{isVerified ? 'Payment Method' : 'Link Bank Account'}</Text>

            {isVerified && existing ? (
              <>
                <View style={s.verifiedCard}>
                  <Ionicons name="checkmark-circle" size={32} color="#4CD964" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.verifiedTitle}>Verified ✓</Text>
                    <Text style={s.verifiedDisplay}>{existing.display}</Text>
                    <Text style={s.verifiedName}>{existing.account_holder_name}</Text>
                  </View>
                </View>
                <Text style={s.sub}>You can now withdraw money directly to this bank account.</Text>
                <TouchableOpacity
                  onPress={async () => { await onRemove(); }}
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
            ) : (
              <>
                <Text style={s.sub}>
                  Enter your bank account details. Money will be withdrawn directly to this account.
                </Text>
                <Text style={s.label}>Full name</Text>
                <TextInput
                  style={s.input}
                  placeholder="Name on bank account"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={holder}
                  onChangeText={setHolder}
                />
                <Text style={s.label}>Linked mobile (10 digits)</Text>
                <TextInput
                  style={s.input}
                  keyboardType="phone-pad"
                  placeholder="Bank linked number"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={phone}
                  onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, '').slice(0, 10))}
                  maxLength={10}
                />
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
                <TouchableOpacity onPress={handleSetup} disabled={busy} activeOpacity={0.85}>
                  <LinearGradient colors={busy ? ['#555', '#444'] : ['#FF2D55', '#FF6B8A']} style={s.btn}>
                    {busy ? <ActivityIndicator color="#FFF" /> : (
                      <Text style={s.btnText}>Submit Details</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
        </View>
    </KeyboardSheet>
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
  label: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14, color: '#FFF', fontSize: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 16, marginTop: 18,
  },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  backBtn: { alignItems: 'center', marginTop: 14, marginBottom: 14 },
  verifiedCard: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    backgroundColor: 'rgba(76,217,100,0.1)', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(76,217,100,0.25)', marginBottom: 12,
  },
  verifiedTitle: { color: '#4CD964', fontSize: 14, fontWeight: '800' },
  verifiedDisplay: { color: '#FFF', fontSize: 16, fontWeight: '800', marginTop: 4 },
  verifiedName: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 },
  unlink: { color: '#FF2D55', fontSize: 13, fontWeight: '700' },
});