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

type Props = {
  visible: boolean;
  onClose: () => void;
  onWithdraw: (amount: number) => void;
  busy?: boolean;
  balance?: number;
  minWithdraw?: number;
  paymentMethod?: PaymentMethodInfo | null;
  onSetupPayment?: () => void;
};

export default function WithdrawModal({
  visible,
  onClose,
  onWithdraw,
  busy,
  balance = 0,
  minWithdraw = 500,
  paymentMethod,
  onSetupPayment,
}: Props) {
  const [amount, setAmount] = useState('');

  const parsed = Number(amount) || 0;
  const canWithdraw = paymentMethod?.status === 'verified' && balance >= minWithdraw;

  const handleWithdraw = () => {
    if (!canWithdraw || parsed < minWithdraw || parsed > balance) return;
    onWithdraw(parsed);
    setAmount('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <View style={s.sheet} onStartShouldSetResponder={() => true}>
          <View style={s.handle} />
          <Text style={s.title}>Withdraw Money</Text>
          <Text style={s.sub}>
            Funds will be sent from your wallet to your verified bank/UPI (1–3 business days).
          </Text>

          <View style={s.balanceRow}>
            <Text style={s.balanceLabel}>Available</Text>
            <Text style={s.balanceVal}>₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
          </View>

          {paymentMethod?.status === 'verified' ? (
            <View style={s.bankRow}>
              <Ionicons name="business" size={20} color="#FF9500" />
              <Text style={s.bankVal}>{paymentMethod.display}</Text>
            </View>
          ) : (
            <TouchableOpacity style={s.setupBanner} onPress={onSetupPayment}>
              <Ionicons name="shield-outline" size={20} color="#FF2D55" />
              <Text style={s.setupText}>Verify your Bank/UPI first to withdraw</Text>
            </TouchableOpacity>
          )}

          <Text style={s.inputLabel}>Amount (min ₹{minWithdraw})</Text>
          <View style={s.inputRow}>
            <Text style={s.rupee}>₹</Text>
            <TextInput
              style={s.input}
              placeholder={`e.g. ${minWithdraw}`}
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="numeric"
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
            />
          </View>

          <View style={s.quickRow}>
            {[minWithdraw, 1000, Math.floor(balance)].filter((v, i, a) => v >= minWithdraw && a.indexOf(v) === i).slice(0, 3).map((amt) => (
              <TouchableOpacity key={amt} style={s.quickBtn} onPress={() => setAmount(String(amt))}>
                <Text style={s.quickText}>₹{amt.toLocaleString('en-IN')}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={canWithdraw ? handleWithdraw : onSetupPayment}
            disabled={busy || (canWithdraw && (!parsed || parsed < minWithdraw || parsed > balance))}
          >
            <LinearGradient
              colors={busy ? ['#555', '#444'] : ['#FF9500', '#FF6B00']}
              style={s.btn}
            >
              {busy ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={s.btnText}>
                  {canWithdraw
                    ? `Withdraw ₹${(parsed || 0).toLocaleString('en-IN')}`
                    : 'Verify Bank / UPI'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 20 },
  title: { color: '#FFF', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sub: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 18 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, padding: 14, backgroundColor: 'rgba(255,149,0,0.1)', borderRadius: 14 },
  balanceLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  balanceVal: { color: '#FF9500', fontSize: 18, fontWeight: '800' },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, padding: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12 },
  bankVal: { color: '#FFF', fontSize: 14, fontWeight: '600', flex: 1 },
  setupBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, padding: 14, backgroundColor: 'rgba(255,45,85,0.1)', borderRadius: 14 },
  setupText: { color: '#FF2D55', fontSize: 14, fontWeight: '700', flex: 1 },
  inputLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, paddingHorizontal: 16, marginBottom: 12 },
  rupee: { color: '#FF9500', fontSize: 20, fontWeight: '800', marginRight: 8 },
  input: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '700', paddingVertical: 14 },
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  quickBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  quickText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  btn: { paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});