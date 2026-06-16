import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  Easing,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTabFocus } from '../../lib/useTabFocus';
import { DIAMOND_PACKAGES, formatCount as fmt, formatInr as price } from '../../lib/diamondPackages';
import { useWallet } from '../../lib/useWallet';
import RazorpayCheckout from '../../components/payments/RazorpayCheckout';
import AddMoneyModal from '../../components/payments/AddMoneyModal';
import SetupPaymentModal from '../../components/payments/SetupPaymentModal';

const { width: SW } = Dimensions.get('window');
const CARD_W = (SW - 48 - 14) / 2;

export default function GiftsScreen() {
  const { user } = useAuth();
  const {
    busy,
    checkout,
    paymentMethod,
    hasVerifiedPayment,
    isPendingVerification,
    addMoney,
    buyWithWallet,
    buyWithRazorpay,
    setupPaymentMethod,
    verifyPaymentOtp,
    resendPaymentOtp,
    removePaymentMethod,
    handleTopupSuccess,
    cancelTopup,
  } = useWallet();
  const insets = useSafeAreaInsets();
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [showSetupPayment, setShowSetupPayment] = useState(false);
  const [selPkg, setSelPkg] = useState<number | null>(null);

  const resetOverlays = useCallback(() => {
    setShowAddMoney(false);
    setShowSetupPayment(false);
    setSelPkg(null);
  }, []);

  const { pointerEvents } = useTabFocus(resetOverlays);

  const walletBalance = user?.wallet_balance ?? 0;

  const bottomNavPadding = Platform.OS === 'android'
    ? (insets.bottom > 0 ? insets.bottom + 26 : 38)
    : (insets.bottom > 0 ? insets.bottom + 18 : 46);
  const TAB_BAR_HEIGHT = 60 + bottomNavPadding;

  const wobble = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(wobble, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(wobble, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const rot = wobble.interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '6deg'] });
  const scaleAnim = wobble.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.08, 1] });

  const buyPkg = (pkg: (typeof DIAMOND_PACKAGES)[number]) => {
    if (busy) return;
    const canAfford = walletBalance >= pkg.price;
    setSelPkg(pkg.id);
    Alert.alert(
      'Buy Diamonds',
      `${fmt(pkg.diamonds)} Diamonds for ${price(pkg.price)}\n\nPay via Razorpay or use wallet balance.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setSelPkg(null) },
        {
          text: 'Pay via Razorpay',
          onPress: async () => {
            setSelPkg(null);
            await buyWithRazorpay(pkg.id, 'diamonds');
          },
        },
        canAfford
          ? {
              text: 'Use Wallet',
              onPress: async () => {
                setSelPkg(null);
                await buyWithWallet(pkg.id, 'diamonds');
              },
            }
          : {
              text: 'Add Money',
              onPress: () => {
                setSelPkg(null);
                setShowAddMoney(true);
              },
            },
      ],
    );
  };

  const openAddMoney = () => {
    setShowAddMoney(true);
  };

  const onAddMoney = async (amount: number) => {
    setShowAddMoney(false);
    const res = await addMoney(amount);
    if (res?.needsSetup) setShowSetupPayment(true);
  };

  return (
    <SafeAreaView style={s.container} edges={['top']} pointerEvents={pointerEvents}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Wallet & Diamonds</Text>
        <TouchableOpacity activeOpacity={0.7} style={s.iconBtn} onPress={openAddMoney}>
          <Ionicons name="add-circle" size={24} color="#4CD964" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: TAB_BAR_HEIGHT + 20 }]} showsVerticalScrollIndicator={false}>
        {/* Step 1: INR Wallet — trading app style */}
        <LinearGradient
          colors={['#1a3d2e', '#0f2920', '#0a1f18']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.walletBanner}
        >
          <View style={s.walletInner}>
            <View style={s.walletTop}>
              <View>
                <Text style={s.walletLabel}>Available Balance</Text>
                <Text style={s.walletVal}>₹{walletBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              </View>
              <TouchableOpacity onPress={openAddMoney} activeOpacity={0.85}>
                <LinearGradient colors={['#4CD964', '#30D158']} style={s.addMoneyBtn}>
                  <Ionicons name="wallet" size={16} color="#FFF" />
                  <Text style={s.addMoneyText}>Add Money</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
            <Text style={s.walletHint}>
              {hasVerifiedPayment && paymentMethod
                ? `✓ ${paymentMethod.display}`
                : '① Verify Bank/UPI  ② Add Money  ③ Buy Diamonds'}
            </Text>
          </View>
        </LinearGradient>

        {/* Diamonds balance */}
        <LinearGradient
          colors={['#FF2D55', '#FF6B8A', '#FF2D55']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.balBanner}
        >
          <View style={s.balGlass}>
            <Text style={s.balLabel}>Your Diamonds</Text>
            <View style={s.balRow}>
              <Animated.View style={{ transform: [{ rotate: rot }, { scale: scaleAnim }] }}>
                <Ionicons name="diamond" size={32} color="#FFF" />
              </Animated.View>
              <Text style={s.balVal}>{fmt(user?.diamonds ?? 0)}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Buy Diamonds</Text>
          <Text style={s.sectionSub}>Uses wallet balance — no payment each time</Text>
        </View>

        <View style={s.grid}>
          {DIAMOND_PACKAGES.map(pkg => {
            const bonusPct = pkg.bonus ? Math.round(((pkg.diamonds - pkg.bonus) / pkg.bonus) * 100) : 0;
            const isSelected = selPkg === pkg.id;
            const affordable = walletBalance >= pkg.price;

            return (
              <TouchableOpacity
                key={pkg.id}
                style={[s.card, isSelected && s.cardActive, !affordable && s.cardDisabled]}
                onPress={() => buyPkg(pkg)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={isSelected ? ['rgba(255,45,85,0.15)', 'rgba(255,45,85,0.05)'] : ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
                  style={s.cardInner}
                >
                  <View style={s.cardBody}>
                    <Ionicons name="diamond" size={32} color={isSelected ? '#FF2D55' : '#FFD700'} style={s.cardDiamondShape} />
                    {bonusPct > 0 && (
                      <View style={s.bonusBadge}>
                        <Text style={s.bonusTxt}>+{bonusPct}%</Text>
                      </View>
                    )}
                    <Text style={s.pkgAmt}>{fmt(pkg.diamonds)}</Text>
                    {pkg.bonus && <Text style={s.pkgOldAmt}>{fmt(pkg.bonus)}</Text>}
                  </View>

                  <View style={[s.priceBox, isSelected && s.priceBoxActive, !affordable && s.priceBoxLow]}>
                    <Text style={[s.priceTxt, isSelected && s.priceTxtActive]}>{price(pkg.price)}</Text>
                    {!affordable && <Text style={s.lowBal}>Low balance</Text>}
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.flowBox}>
          <Text style={s.flowTitle}>How it works</Text>
          <Text style={s.flowStep}>① Add Money — Razorpay (UPI / Card / Net Banking)</Text>
          <Text style={s.flowStep}>② Buy Diamonds — Pay via Razorpay ya wallet balance se</Text>
          <Text style={s.flowStep}>③ Send gifts — use diamonds in live & PK</Text>
        </View>

        <View style={s.secureFooter}>
          <Ionicons name="shield-checkmark" size={16} color="#4CD964" />
          <Text style={s.secureTxt}>Bank payments secured by Razorpay</Text>
        </View>
      </ScrollView>

      <SetupPaymentModal
        visible={showSetupPayment}
        onClose={() => setShowSetupPayment(false)}
        busy={busy}
        existing={paymentMethod}
        onSetup={setupPaymentMethod}
        onVerifyOtp={verifyPaymentOtp}
        onResendOtp={resendPaymentOtp}
        onRemove={removePaymentMethod}
      />

      <AddMoneyModal
        visible={showAddMoney}
        onClose={() => setShowAddMoney(false)}
        onAdd={onAddMoney}
        onLinkBank={() => { setShowAddMoney(false); setShowSetupPayment(true); }}
        busy={busy}
        currentBalance={walletBalance}
        linkedBank={paymentMethod}
      />

      <RazorpayCheckout
        checkout={checkout}
        onSuccess={handleTopupSuccess}
        onCancel={cancelTopup}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(76,217,100,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  content: { paddingHorizontal: 20, paddingBottom: 70 },

  walletBanner: { borderRadius: 20, marginTop: 8, marginBottom: 16, overflow: 'hidden' },
  walletInner: { padding: 20 },
  walletTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  walletLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  walletVal: { color: '#4CD964', fontSize: 36, fontWeight: '900', marginTop: 4 },
  walletHint: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 12 },
  addMoneyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14,
  },
  addMoneyText: { color: '#FFF', fontSize: 14, fontWeight: '800' },

  balBanner: {
    borderRadius: 20, padding: 2, marginBottom: 20,
    shadowColor: '#FF2D55', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 12,
  },
  balGlass: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 18,
    paddingVertical: 18, alignItems: 'center',
  },
  balLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  balRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  balVal: { color: '#FFF', fontSize: 32, fontWeight: '900' },

  sectionHeader: { marginBottom: 14 },
  sectionTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  sectionSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between' },
  card: { width: CARD_W, borderRadius: 20, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.05)' },
  cardActive: { borderColor: '#FF2D55' },
  cardDisabled: { opacity: 0.85 },
  cardInner: { flex: 1, paddingTop: 20, paddingHorizontal: 12 },
  cardBody: { alignItems: 'center', flex: 1, position: 'relative' },
  cardDiamondShape: { marginBottom: 12 },
  bonusBadge: { position: 'absolute', top: -6, right: '5%', backgroundColor: '#FF2D55', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  bonusTxt: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  pkgAmt: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  pkgOldAmt: { color: 'rgba(255,255,255,0.3)', fontSize: 13, textDecorationLine: 'line-through', marginTop: 2 },

  priceBox: { marginTop: 16, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.08)', paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  priceBoxActive: { backgroundColor: '#FF2D55' },
  priceBoxLow: { backgroundColor: 'rgba(255,149,0,0.15)' },
  priceTxt: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  priceTxtActive: { color: '#FFF' },
  lowBal: { color: '#FF9500', fontSize: 9, fontWeight: '700', marginTop: 2 },

  flowBox: {
    marginTop: 24, padding: 16, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  flowTitle: { color: '#FFF', fontSize: 14, fontWeight: '700', marginBottom: 10 },
  flowStep: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 6 },

  secureFooter: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 24 },
  secureTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
});