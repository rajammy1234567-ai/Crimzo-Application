import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { PaymentMethodInfo } from './SetupPaymentModal';

const PRESETS = [100, 500, 1000, 2000, 5000, 10000];

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdd: (amount: number) => void;
  onLinkBank?: () => void;
  busy?: boolean;
  currentBalance?: number;
  linkedBank?: PaymentMethodInfo | null;
};

export default function AddMoneyModal({
  visible,
  onClose,
  onAdd,
  onLinkBank,
  busy,
  currentBalance = 0,
  linkedBank,
}: Props) {
  const [custom, setCustom] = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  const displayAmount = selected ?? (Number(custom) || 0);

  const handleAdd = () => {
    const amount = selected ?? Number(custom);
    if (!Number.isFinite(amount) || amount < 50) return;
    onAdd(amount);
    setCustom('');
    setSelected(null);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <View style={s.sheet} onStartShouldSetResponder={() => true}>
          <View style={s.handle} />
          <Text style={s.title}>Add Money to Wallet</Text>
          <Text style={s.sub}>
            UPI, Card ya Net Banking se Razorpay par secure payment karo.
          </Text>

          {linkedBank?.status === 'verified' ? (
            <View style={s.bankRow}>
              <Ionicons
                name={linkedBank.type === 'upi' ? 'phone-portrait' : 'business'}
                size={20}
                color="#4CD964"
              />
              <View style={{ flex: 1 }}>
                <Text style={s.bankLabel}>Withdraw ke liye linked</Text>
                <Text style={s.bankVal}>{linkedBank.display}</Text>
              </View>
              {onLinkBank ? (
                <TouchableOpacity onPress={onLinkBank}>
                  <Text style={s.changeBank}>Change</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <View style={s.balanceRow}>
            <Ionicons name="wallet-outline" size={20} color="#4CD964" />
            <Text style={s.balanceLabel}>Current balance</Text>
            <Text style={s.balanceVal}>₹{currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
          </View>

          <Text style={s.presetTitle}>Quick amounts</Text>
          <View style={s.presetGrid}>
            {PRESETS.map((amt) => (
              <TouchableOpacity
                key={amt}
                style={[s.presetBtn, selected === amt && s.presetActive]}
                onPress={() => { setSelected(amt); setCustom(''); }}
                activeOpacity={0.8}
              >
                <Text style={[s.presetText, selected === amt && s.presetTextActive]}>
                  ₹{amt.toLocaleString('en-IN')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.customLabel}>Or enter amount (min ₹50)</Text>
          <View style={s.customRow}>
            <Text style={s.rupee}>₹</Text>
            <TextInput
              style={s.customInput}
              placeholder="e.g. 1500"
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="numeric"
              value={custom}
              onChangeText={(t) => { setCustom(t.replace(/[^0-9]/g, '')); setSelected(null); }}
            />
          </View>

          <TouchableOpacity
            onPress={handleAdd}
            disabled={busy || (!selected && !custom)}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={busy ? ['#555', '#444'] : ['#4CD964', '#30D158']}
              style={s.addBtn}
            >
              {busy ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="add-circle" size={22} color="#FFF" />
                  <Text style={s.addBtnText}>
                    {`Add ₹${displayAmount.toLocaleString('en-IN')} via Razorpay`}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={s.secureRow}>
            <Ionicons name="shield-checkmark" size={14} color="#4CD964" />
            <Text style={s.secureText}>Secured by Razorpay</Text>
          </View>
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
    paddingBottom: 40,
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
  bankRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(76,217,100,0.08)', borderRadius: 14,
    padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(76,217,100,0.2)',
  },
  bankLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600' },
  bankVal: { color: '#FFF', fontSize: 15, fontWeight: '800', marginTop: 2 },
  changeBank: { color: '#FF2D55', fontSize: 12, fontWeight: '700' },
  linkBankBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,45,85,0.1)', borderRadius: 14,
    padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(255,45,85,0.25)',
  },
  linkBankText: { color: '#FF2D55', fontSize: 14, fontWeight: '700', flex: 1 },
  balanceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(76,217,100,0.1)', borderRadius: 14,
    padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(76,217,100,0.2)',
  },
  balanceLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, flex: 1 },
  balanceVal: { color: '#4CD964', fontSize: 18, fontWeight: '800' },
  presetTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  presetBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  presetActive: { backgroundColor: 'rgba(76,217,100,0.15)', borderColor: '#4CD964' },
  presetText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  presetTextActive: { color: '#4CD964' },
  customLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 8 },
  customRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14,
    paddingHorizontal: 16, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  rupee: { color: '#4CD964', fontSize: 20, fontWeight: '800', marginRight: 8 },
  customInput: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '700', paddingVertical: 14 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 16,
  },
  addBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  secureRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 16 },
  secureText: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
});