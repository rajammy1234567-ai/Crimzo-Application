import React, { useState } from 'react';
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
import type { PaymentMethodInfo } from './SetupPaymentModal';
import { BEAN_PACKAGES, formatCount, formatInr } from '../../lib/diamondPackages';

export type WithdrawInfo = {
  diamonds?: number;
  beans?: number;
  diamondsAsBeans?: number;
  totalBeans?: number;
  withdrawableInr?: number;
  beansPerInr?: number;
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
  const beans = withdrawInfo?.beans ?? 0;
  const diamondsAsBeans = withdrawInfo?.diamondsAsBeans ?? diamonds;
  const totalBeans = withdrawInfo?.totalBeans ?? beans + diamondsAsBeans;
  const balance = withdrawInfo?.withdrawableInr ?? 0;

  const parsed = Number(amount) || 0;
  const canWithdraw =
    paymentMethod?.status === 'verified'
    && (paymentMethod?.type === 'bank' || paymentMethod?.type === 'upi')
    && balance >= minWithdraw;

  const affordableTiers = BEAN_PACKAGES.filter((p) => p.price <= balance && p.price >= minWithdraw);

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
          <Text style={s.title}>Withdraw Earnings</Text>
          <Text style={s.sub}>
            Diamonds convert to beans, then real money is sent to your verified bank account or UPI ID — not your phone number.
          </Text>

          {diamonds > 0 && (
            <View style={s.convertRow}>
              <Ionicons name="swap-horizontal" size={18} color="#FFD700" />
              <Text style={s.convertTxt}>
                {formatCount(diamonds)} diamonds → {formatCount(diamondsAsBeans)} beans
              </Text>
            </View>
          )}

          <View style={s.balanceRow}>
            <View>
              <Text style={s.balanceLabel}>Total Beans</Text>
              <Text style={s.beansVal}>{formatCount(totalBeans)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.balanceLabel}>Withdrawable</Text>
              <Text style={s.balanceVal}>{formatInr(balance)}</Text>
            </View>
          </View>

          {beans > 0 && diamonds > 0 && (
            <Text style={s.breakdown}>
              {formatCount(beans)} beans + {formatCount(diamondsAsBeans)} from diamonds
            </Text>
          )}

          {paymentMethod?.status === 'verified' ? (
            <View style={s.bankRow}>
              <Ionicons
                name={paymentMethod.type === 'upi' ? 'phone-portrait-outline' : 'business'}
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
              <Text style={s.setupText}>Verify your Bank/UPI first to withdraw</Text>
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

          {affordableTiers.length > 0 && (
            <>
              <Text style={s.tierLabel}>Quick withdraw by bean tier</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tierScroll}>
                {affordableTiers.map((tier) => (
                  <TouchableOpacity
                    key={tier.id}
                    style={s.tierBtn}
                    onPress={() => setAmount(String(tier.price))}
                  >
                    <Text style={s.tierBeans}>{formatCount(tier.beans)} beans</Text>
                    <Text style={s.tierInr}>{formatInr(tier.price)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

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
  sub: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 16, lineHeight: 18 },
  convertRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
    backgroundColor: 'rgba(255,215,0,0.1)', borderRadius: 12, padding: 10, marginBottom: 12,
  },
  convertTxt: { color: '#FFD700', fontSize: 13, fontWeight: '700' },
  balanceRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8,
    padding: 14, backgroundColor: 'rgba(255,149,0,0.1)', borderRadius: 14,
  },
  balanceLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  beansVal: { color: '#FF9500', fontSize: 16, fontWeight: '800', marginTop: 2 },
  balanceVal: { color: '#FF9500', fontSize: 20, fontWeight: '800', marginTop: 2 },
  breakdown: { color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center', marginBottom: 12 },
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
  tierLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  tierScroll: { marginBottom: 16 },
  tierBtn: {
    backgroundColor: 'rgba(255,149,0,0.12)', borderRadius: 12, padding: 12,
    marginRight: 10, borderWidth: 1, borderColor: 'rgba(255,149,0,0.25)', minWidth: 110,
  },
  tierBeans: { color: '#FF9500', fontSize: 13, fontWeight: '800' },
  tierInr: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4, fontWeight: '600' },
  btn: { paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});