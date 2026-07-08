import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { KeyboardSheet } from '../KeyboardAware';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { PaymentMethodInfo } from './SetupPaymentModal';
import { formatCount, formatInr } from '../../lib/diamondPackages';

export type WithdrawInfo = {
  diamonds?: number;
  withdrawableInr?: number;
  minWithdraw?: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onWithdraw: (amount: number) => void;
  busy?: boolean;
  withdrawInfo?: WithdrawInfo | null;
  minWithdraw?: number;
  paymentMethod?: PaymentMethodInfo | null;
  onSetupPayment?: () => void;
};

export default function WithdrawModal({
  visible,
  onClose,
  onWithdraw,
  busy,
  withdrawInfo,
  minWithdraw = 500,
  paymentMethod,
  onSetupPayment,
}: Props) {
  const [amount, setAmount] = useState('');

  const diamonds = withdrawInfo?.diamonds ?? 0;
  const balance = withdrawInfo?.withdrawableInr ?? 0;

  const parsed = Number(amount) || 0;
  const canWithdraw =
    paymentMethod?.status === 'verified'
    && paymentMethod?.type === 'bank'
    && balance >= minWithdraw;

  const handleWithdraw = () => {
    if (!canWithdraw || parsed < minWithdraw || parsed > balance) return;
    onWithdraw(parsed);
    setAmount('');
  };

  return (
    <KeyboardSheet visible={visible} onClose={onClose}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.title}>Withdraw Earnings</Text>
          <Text style={s.sub}>
            Add verified bank details, then submit.
          </Text>

          <View style={s.scheduleBanner}>
            <Ionicons name="calendar-outline" size={18} color="#4CD964" />
            <Text style={s.scheduleTxt}>
              Withdrawal har mahine ki 6 date ko hoga.
            </Text>
          </View>

          <View style={s.balanceRow}>
            <View>
              <Text style={s.balanceLabel}>Total Diamonds</Text>
              <Text style={s.diamondsVal}>{formatCount(diamonds)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.balanceLabel}>Withdrawable</Text>
              <Text style={s.balanceVal}>{formatInr(balance)}</Text>
            </View>
          </View>

          {paymentMethod?.status === 'verified' ? (
            <View style={s.bankRow}>
              <Ionicons
                name="business"
                size={20}
                color="#FF9500"
              />
              <View style={{ flex: 1 }}>
                <Text style={s.bankVal}>{paymentMethod.display}</Text>
                <Text style={s.bankHint}>Payout destination — money goes here</Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={s.setupBanner} onPress={onSetupPayment}>
              <Ionicons name="shield-outline" size={20} color="#FF2D55" />
              <Text style={s.setupText}>Verify your Bank Account first to withdraw</Text>
            </TouchableOpacity>
          )}

          <Text style={s.inputLabel}>Amount (min {formatInr(minWithdraw)})</Text>
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
            {[minWithdraw, 1000, Math.floor(balance)]
              .filter((v, i, a) => v >= minWithdraw && a.indexOf(v) === i)
              .slice(0, 3)
              .map((amt) => (
                <TouchableOpacity key={amt} style={s.quickBtn} onPress={() => setAmount(String(amt))}>
                  <Text style={s.quickText}>₹{amt.toLocaleString('en-IN')}</Text>
                </TouchableOpacity>
              ))}
          </View>

          <TouchableOpacity
            onPress={paymentMethod?.status === 'verified' ? handleWithdraw : onSetupPayment}
            disabled={busy || (paymentMethod?.status === 'verified' && (!parsed || parsed < minWithdraw || parsed > balance))}
          >
            <LinearGradient
              colors={busy ? ['#555', '#444'] : ['#FF9500', '#FF6B00']}
              style={s.btn}
            >
              {busy ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={s.btnText}>
                  {paymentMethod?.status === 'verified'
                    ? `Confirm Withdraw ₹${(parsed || 0).toLocaleString('en-IN')}`
                    : 'Add Bank Details'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
    </KeyboardSheet>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 20 },
  title: { color: '#FFF', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sub: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 12, lineHeight: 18 },
  scheduleBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(76,217,100,0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(76,217,100,0.2)',
  },
  scheduleTxt: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 17 },
  balanceRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16,
    padding: 14, backgroundColor: 'rgba(255,149,0,0.1)', borderRadius: 14,
  },
  balanceLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  diamondsVal: { color: '#00BFFF', fontSize: 16, fontWeight: '800', marginTop: 2 },
  balanceVal: { color: '#FF9500', fontSize: 20, fontWeight: '800', marginTop: 2 },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, padding: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12 },
  bankVal: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  bankHint: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  setupBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, padding: 14, backgroundColor: 'rgba(255,45,85,0.1)', borderRadius: 14 },
  setupText: { color: '#FF2D55', fontSize: 14, fontWeight: '700', flex: 1 },
  inputLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, paddingHorizontal: 16, marginBottom: 12 },
  rupee: { color: '#FF9500', fontSize: 20, fontWeight: '800', marginRight: 8 },
  input: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '700', paddingVertical: 14 },
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  quickBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  quickText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  btn: { paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});