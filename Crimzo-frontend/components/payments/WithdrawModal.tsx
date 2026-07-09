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
  earnedBeans?: number;
  beansPerInr?: number;
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
  const diamonds = withdrawInfo?.diamonds ?? 0;
  const earnedBeans = withdrawInfo?.earnedBeans ?? 0;
  const beansPerInr = withdrawInfo?.beansPerInr ?? 50;
  
  const earnedInr = earnedBeans / beansPerInr;
  const purchasedInr = diamonds / beansPerInr;

  const [withdrawEarned, setWithdrawEarned] = useState(false);
  const [withdrawPurchased, setWithdrawPurchased] = useState(false);

  const [showEarnedMoney, setShowEarnedMoney] = useState(false);
  const [showPurchasedMoney, setShowPurchasedMoney] = useState(false);

  const subtotal = (withdrawEarned ? earnedInr : 0) + (withdrawPurchased ? purchasedInr : 0);
  const tax = subtotal * 0.23;
  const totalPayout = subtotal - tax;

  const canWithdraw =
    paymentMethod?.status === 'verified'
    && paymentMethod?.type === 'bank'
    && subtotal >= minWithdraw;

  const handleWithdraw = () => {
    if (!canWithdraw || subtotal < minWithdraw) return;
    onWithdraw(subtotal);
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
              Withdrawals will be processed on the 6th of every month.
            </Text>
          </View>

          <View style={s.checkboxContainer}>
            <TouchableOpacity 
              style={[s.checkRow, withdrawEarned && s.checkRowActive]} 
              onPress={() => setWithdrawEarned(!withdrawEarned)}
              activeOpacity={0.7}
            >
              <View style={s.checkLeft}>
                <Ionicons name={withdrawEarned ? "checkbox" : "square-outline"} size={22} color={withdrawEarned ? "#FF2D55" : "rgba(255,255,255,0.3)"} />
                <View>
                  <Text style={s.checkTitle}>Earned Diamonds</Text>
                  <Text style={s.checkSub}>{formatCount(earnedBeans)} (from calls, chats, etc.)</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowEarnedMoney(!showEarnedMoney)} style={s.toggleMoneyBtn}>
                <Text style={s.toggleMoneyTxt}>{showEarnedMoney ? formatInr(earnedInr) : 'Show ₹'}</Text>
              </TouchableOpacity>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[s.checkRow, withdrawPurchased && s.checkRowActive]} 
              onPress={() => setWithdrawPurchased(!withdrawPurchased)}
              activeOpacity={0.7}
            >
              <View style={s.checkLeft}>
                <Ionicons name={withdrawPurchased ? "checkbox" : "square-outline"} size={22} color={withdrawPurchased ? "#00BFFF" : "rgba(255,255,255,0.3)"} />
                <View>
                  <Text style={s.checkTitle}>Other Diamonds</Text>
                  <Text style={s.checkSub}>{formatCount(diamonds)} (purchased/other)</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowPurchasedMoney(!showPurchasedMoney)} style={s.toggleMoneyBtn}>
                <Text style={s.toggleMoneyTxt}>{showPurchasedMoney ? formatInr(purchasedInr) : 'Show ₹'}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </View>

          <View style={s.invoiceCard}>
            <Text style={s.invoiceTitle}>Withdrawal Summary</Text>
            <View style={s.invoiceRow}>
              <Text style={s.invoiceLabel}>Subtotal</Text>
              <Text style={s.invoiceVal}>{formatInr(subtotal)}</Text>
            </View>
            <View style={s.invoiceRow}>
              <Text style={s.invoiceLabel}>Taxes & Fees</Text>
              <Text style={[s.invoiceVal, { color: '#FF3B30' }]}>- {formatInr(tax)}</Text>
            </View>
            <View style={s.invoiceDivider} />
            <View style={s.invoiceRow}>
              <Text style={s.invoiceTotalLabel}>Total Payout</Text>
              <Text style={s.invoiceTotalVal}>{formatInr(totalPayout)}</Text>
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

          <TouchableOpacity
            onPress={paymentMethod?.status === 'verified' ? handleWithdraw : onSetupPayment}
            disabled={busy || (paymentMethod?.status === 'verified' && subtotal < minWithdraw)}
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
                    ? `Confirm Withdraw ${formatInr(totalPayout)}`
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
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, padding: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12 },
  bankVal: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  bankHint: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  setupBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, padding: 14, backgroundColor: 'rgba(255,45,85,0.1)', borderRadius: 14 },
  setupText: { color: '#FF2D55', fontSize: 14, fontWeight: '700', flex: 1 },
  checkboxContainer: { marginBottom: 16, gap: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  checkRowActive: { borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.08)' },
  checkLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkTitle: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  checkSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  toggleMoneyBtn: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  toggleMoneyTxt: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  invoiceCard: { backgroundColor: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 12, marginBottom: 16 },
  invoiceTitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700', marginBottom: 12, textTransform: 'uppercase' },
  invoiceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  invoiceLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  invoiceVal: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  invoiceDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 10 },
  invoiceTotalLabel: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  invoiceTotalVal: { color: '#4CD964', fontSize: 16, fontWeight: '800' },
  btn: { paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});