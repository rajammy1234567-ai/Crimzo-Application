import React, { useState } from 'react';
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

export type LinkedBankInfo = {
  account_holder_name: string;
  bank_name: string;
  account_last4: string;
  ifsc: string;
  upi_id?: string | null;
  status: string;
  display?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onLink: (data: {
    account_holder_name: string;
    account_number: string;
    ifsc: string;
    upi_id?: string;
  }) => Promise<boolean>;
  busy?: boolean;
  existing?: LinkedBankInfo | null;
  onUnlink?: () => Promise<void>;
};

export default function LinkBankModal({
  visible,
  onClose,
  onLink,
  busy,
  existing,
  onUnlink,
}: Props) {
  const [holder, setHolder] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upi, setUpi] = useState('');

  const handleLink = async () => {
    const ok = await onLink({
      account_holder_name: holder.trim(),
      account_number: account.replace(/\D/g, ''),
      ifsc: ifsc.trim().toUpperCase(),
      upi_id: upi.trim() || undefined,
    });
    if (ok) {
      setHolder('');
      setAccount('');
      setIfsc('');
      setUpi('');
      onClose();
    }
  };

  return (
    <KeyboardSheet visible={visible} onClose={onClose}>
        <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.title}>Link Bank Account</Text>
            <Text style={s.sub}>
              Add your bank once. When you top up wallet, money will be debited from this account.
            </Text>

            {existing ? (
              <View style={s.linkedCard}>
                <Ionicons name="business-outline" size={28} color="#4CD964" />
                <View style={s.linkedInfo}>
                  <Text style={s.linkedBank}>{existing.bank_name}</Text>
                  <Text style={s.linkedAcct}>A/C •••• {existing.account_last4}</Text>
                  <Text style={s.linkedMeta}>{existing.account_holder_name} · {existing.ifsc}</Text>
                  {existing.upi_id ? (
                    <Text style={s.linkedMeta}>UPI: {existing.upi_id}</Text>
                  ) : null}
                </View>
                {onUnlink ? (
                  <TouchableOpacity onPress={onUnlink} disabled={busy}>
                    <Text style={s.unlink}>Change</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <>
                <Text style={s.label}>Account holder name</Text>
                <TextInput
                  style={s.input}
                  placeholder="As per bank records"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={holder}
                  onChangeText={setHolder}
                  autoCapitalize="words"
                />

                <Text style={s.label}>Account number</Text>
                <TextInput
                  style={s.input}
                  placeholder="9–18 digit account number"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="number-pad"
                  value={account}
                  onChangeText={(t) => setAccount(t.replace(/[^0-9]/g, ''))}
                  maxLength={18}
                />

                <Text style={s.label}>IFSC code</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. HDFC0001234"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  autoCapitalize="characters"
                  value={ifsc}
                  onChangeText={(t) => setIfsc(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  maxLength={11}
                />

                <Text style={s.label}>UPI ID (optional, faster payments)</Text>
                <TextInput
                  style={s.input}
                  placeholder="yourname@upi"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  autoCapitalize="none"
                  value={upi}
                  onChangeText={setUpi}
                />

                <TouchableOpacity onPress={handleLink} disabled={busy} activeOpacity={0.85}>
                  <LinearGradient
                    colors={busy ? ['#555', '#444'] : ['#4CD964', '#30D158']}
                    style={s.btn}
                  >
                    {busy ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <>
                        <Ionicons name="link" size={20} color="#FFF" />
                        <Text style={s.btnText}>Link Bank Account</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            <View style={s.note}>
              <Ionicons name="information-circle-outline" size={16} color="rgba(255,255,255,0.4)" />
              <Text style={s.noteText}>
                Razorpay securely processes the debit from your bank to your Crimzo wallet.
              </Text>
            </View>
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
    maxHeight: '90%',
  },
  handle: {
    width: 44, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginBottom: 20,
  },
  title: { color: '#FFF', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sub: {
    color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center',
    marginTop: 8, marginBottom: 20, lineHeight: 18,
  },
  label: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14, color: '#FFF', fontSize: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 16, marginTop: 20,
  },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  linkedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(76,217,100,0.1)', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(76,217,100,0.25)', marginBottom: 12,
  },
  linkedInfo: { flex: 1 },
  linkedBank: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  linkedAcct: { color: '#4CD964', fontSize: 14, fontWeight: '700', marginTop: 2 },
  linkedMeta: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 },
  unlink: { color: '#FF2D55', fontSize: 13, fontWeight: '700' },
  note: { flexDirection: 'row', gap: 8, marginTop: 16, alignItems: 'flex-start' },
  noteText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, flex: 1, lineHeight: 17 },
});