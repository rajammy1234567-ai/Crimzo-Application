import React, { useState, useRef, useEffect } from 'react';
import { appAlert } from '../../lib/appAlert';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Dimensions, Image, Animated, Easing, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import {
  DIAMOND_PACKAGES,
  BEAN_PACKAGES,
  formatCount as fmt,
  formatInr as price,
  beansToInr,
  totalWithdrawableBeans,
} from '../../lib/diamondPackages';
import { useWallet } from '../../lib/useWallet';
import RazorpayCheckout from '../../components/payments/RazorpayCheckout';
import AddMoneyModal from '../../components/payments/AddMoneyModal';
import SetupPaymentModal from '../../components/payments/SetupPaymentModal';
import WithdrawModal from '../../components/payments/WithdrawModal';


const { width: SW } = Dimensions.get('window');
const CARD_W = (SW - 48 - 10) / 2;

// ── Payment methods ──
const PAYMENT_METHODS: { id: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'upi', label: 'UPI', icon: 'phone-portrait-outline' },
  { id: 'card', label: 'Credit / Debit Card', icon: 'card-outline' },
  { id: 'netbanking', label: 'Net Banking', icon: 'globe-outline' },
];

// ── Top-up helpers (dummy) ──
const TOPUP_HELPERS = [
  { id: 1, name: 'Royal Diamond Store', userId: '131464679', rating: 4.8, country: '🇮🇳', verified: true },
  { id: 2, name: 'BEST PRICE Diamond', userId: '73117008', rating: 4.6, country: '🇮🇳', verified: true },
  { id: 3, name: 'CrimzoDiamond Official', userId: '91500897', rating: 4.9, country: '🇮🇳', verified: true },
  { id: 4, name: '24x7 Diamond Shop', userId: '146548316', rating: 4.5, country: '🇮🇳', verified: false },
  { id: 5, name: 'FastRecharge Hub', userId: '146294982', rating: 4.7, country: '🇮🇳', verified: true },
];

function tierBg(t: string): [string, string] {
  const map: Record<string, [string, string]> = {
    basic: ['rgba(255,215,0,0.07)', 'rgba(255,215,0,0.02)'],
    bronze: ['rgba(255,165,0,0.09)', 'rgba(255,165,0,0.02)'],
    silver: ['rgba(192,192,192,0.09)', 'rgba(192,192,192,0.02)'],
    gold: ['rgba(255,215,0,0.12)', 'rgba(255,215,0,0.03)'],
    platinum: ['rgba(229,228,226,0.12)', 'rgba(229,228,226,0.03)'],
    diamond: ['rgba(185,242,255,0.12)', 'rgba(185,242,255,0.03)'],
  };
  return map[t] ?? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)'];
}

// ════════════════════════════════════════════════════════════
// WALLET / TOP-UP SCREEN
// ════════════════════════════════════════════════════════════
export default function WalletScreen() {
  const { user, isGuest } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isGuest) {
      appAlert(
        'Account Required',
        'Create an account to use wallet, recharge, and withdraw.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    }
  }, [isGuest, router]);
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
    withdrawMoney,
    withdrawInfo,
    loadWithdrawInfo,
    handleTopupSuccess,
    handleCheckoutError,
    cancelTopup,
  } = useWallet();
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [showSetupPayment, setShowSetupPayment] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const walletBalance = user?.wallet_balance ?? 0;
  const userDiamonds = user?.diamonds ?? 0;
  const userBeans = user?.beans ?? 0;
  const withdrawableBeans = totalWithdrawableBeans(userDiamonds, userBeans);
  const withdrawableInr = beansToInr(withdrawableBeans);
  const handleWithdrawPress = async () => {
    await loadWithdrawInfo();
    setShowWithdraw(true);
  };

  const [curTab, setCurTab] = useState<'diamonds' | 'beans'>('diamonds');
  const [subTab, setSubTab] = useState<'recommend' | 'helper'>('recommend');
  const [payMethod, setPayMethod] = useState('upi');
  const [showPayModal, setShowPayModal] = useState(false);
  const [selPkg, setSelPkg] = useState<number | null>(null);

  useEffect(() => {
    loadWithdrawInfo();
  }, []);

  // animated tab indicator
  const tabAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(tabAnim, {
      toValue: subTab === 'recommend' ? 0 : 1,
      damping: 18,
      stiffness: 180,
      useNativeDriver: true,
    }).start();
  }, [subTab]);
  const tabX = tabAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, (SW - 48) / 2],
  });

  // animated diamond wobble
  const wobble = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(wobble, { toValue: 1, duration: 2800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(wobble, { toValue: 0, duration: 2800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const rot = wobble.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '8deg'] });
  const sc = wobble.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.1, 1] });

  const buyPkg = (pkg: { id: number; price: number; diamonds?: number; beans?: number }) => {
    if (busy) return;
    const isDia = curTab === 'diamonds';
    const productType = isDia ? 'diamonds' : 'beans';
    const amount = isDia ? pkg.diamonds! : pkg.beans!;
    const canAfford = walletBalance >= pkg.price;
    setSelPkg(pkg.id);
    appAlert(
      `Buy ${isDia ? 'Diamonds' : 'Beans'}`,
      `${fmt(amount)} for ${price(pkg.price)}\n\nPay directly via Razorpay (UPI/Card) or use wallet balance.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setSelPkg(null) },
        {
          text: 'Pay via Razorpay',
          onPress: async () => {
            setSelPkg(null);
            await buyWithRazorpay(pkg.id, productType);
          },
        },
        canAfford
          ? {
              text: 'Use Wallet',
              onPress: async () => {
                setSelPkg(null);
                await buyWithWallet(pkg.id, productType);
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

  const tapHelper = (h: typeof TOPUP_HELPERS[0]) => {
    appAlert(h.name, `ID: ${h.userId}\nRating: ⭐ ${h.rating}\n\nContact this helper for discounted diamonds.`);
  };

  const payInfo = PAYMENT_METHODS.find(p => p.id === payMethod)!;

  // ──────────────── RENDER ────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ══ HEADER ══ */}
      <LinearGradient colors={['#FF2D55', '#FF6B8A', '#FF8E53']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hdr}>
        {/* nav */}
        <View style={s.nav}>
          <TouchableOpacity onPress={() => router.back()} style={s.navBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={s.navBtn} activeOpacity={0.7}>
            <Ionicons name="receipt-outline" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* INR wallet */}
        <TouchableOpacity
          style={s.inrBal}
          onPress={() => setShowAddMoney(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="wallet-outline" size={18} color="#FFF" />
          <Text style={s.inrLabel}>Wallet</Text>
          <Text style={s.inrVal}>₹{walletBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
          <Ionicons name="add-circle" size={20} color="#FFF" />
        </TouchableOpacity>

        {/* balance */}
        <View style={s.bal}>
          <Animated.View style={{ transform: [{ rotate: rot }, { scale: sc }] }}>
            <Ionicons name="diamond" size={28} color="#FFD700" />
          </Animated.View>
          <Text style={s.balVal}>
            {fmt(curTab === 'diamonds' ? (user?.diamonds ?? 0) : (user?.beans ?? 0))}
          </Text>
        </View>

        {/* currency toggle */}
        <View style={s.curTog}>
          {(['diamonds', 'beans'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[s.curBtn, curTab === t && s.curBtnOn]}
              onPress={() => setCurTab(t)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={t === 'diamonds' ? 'diamond' : 'cafe'}
                size={15}
                color={curTab === t ? (t === 'diamonds' ? '#FFD700' : '#FF9500') : 'rgba(255,255,255,0.45)'}
              />
              <Text style={[s.curBtnTxt, curTab === t && s.curBtnTxtOn]}>
                {t === 'diamonds' ? 'Diamonds' : 'Beans'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* ══ BODY ══ */}
      <View style={s.body}>
        {/* sub-tabs */}
        <View style={s.stRow}>
          <Animated.View style={[s.stInd, { transform: [{ translateX: tabX }] }]} />
          {([['recommend', 'sparkles', 'Recommend'], ['helper', 'people', 'Top-up Helper']] as const).map(([key, ico, label]) => (
            <TouchableOpacity key={key} style={s.stBtn} onPress={() => setSubTab(key as any)} activeOpacity={0.7}>
              <Ionicons name={ico as any} size={15} color={subTab === key ? '#FF2D55' : 'rgba(255,255,255,0.3)'} />
              <Text style={[s.stTxt, subTab === key && s.stTxtOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={s.scr}>
          {subTab === 'recommend' ? (
            <>
              <TouchableOpacity
                style={s.pay}
                onPress={() => void handleWithdrawPress()}
                activeOpacity={0.7}
              >
                <View style={s.payL}>
                  <View style={[s.payIco, { backgroundColor: 'rgba(255,149,0,0.15)' }]}>
                    <Ionicons name="arrow-down-circle" size={18} color="#FF9500" />
                  </View>
                  <View>
                    <Text style={s.payLbl}>Withdraw Earnings</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                      {userDiamonds > 0
                        ? `${fmt(userDiamonds)} diamonds → beans → ₹`
                        : 'Beans → real money · credited on 7th next month'}
                    </Text>
                  </View>
                </View>
                <View style={s.payR}>
                  <Text style={[s.payChg, { color: '#FF9500' }]}>
                    {withdrawableInr >= (withdrawInfo?.minWithdraw ?? 500)
                      ? price(withdrawableInr)
                      : `Need ${price(withdrawInfo?.minWithdraw ?? 500)}+`}
                  </Text>
                  <Ionicons name="chevron-forward" size={15} color="#FF9500" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.pay}
                onPress={() => setShowAddMoney(true)}
                activeOpacity={0.7}
              >
                <View style={s.payL}>
                  <View style={[s.payIco, { backgroundColor: 'rgba(76,217,100,0.15)' }]}>
                    <Ionicons name="wallet" size={18} color="#4CD964" />
                  </View>
                  <View>
                    <Text style={s.payLbl}>Add Money to Wallet</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                      Razorpay — UPI / Card / Net Banking
                    </Text>
                  </View>
                </View>
                <View style={s.payR}>
                  <Text style={[s.payChg, { color: '#4CD964' }]}>₹{walletBalance.toLocaleString('en-IN')}</Text>
                  <Ionicons name="chevron-forward" size={15} color="#4CD964" />
                </View>
              </TouchableOpacity>

              {/* packages grid */}
              <View style={s.grid}>
                {(curTab === 'diamonds' ? DIAMOND_PACKAGES : BEAN_PACKAGES).map((pkg: any) => {
                  const isDia = curTab === 'diamonds';
                  const amt = isDia ? pkg.diamonds : pkg.beans;
                  const bonus = isDia ? pkg.bonus : null;
                  const bonusPct = bonus ? Math.round(((amt - bonus) / bonus) * 100) : 0;
                  const bgC = isDia ? tierBg(pkg.tier) : (['rgba(255,153,0,0.08)', 'rgba(255,153,0,0.02)'] as [string, string]);

                  return (
                    <TouchableOpacity
                      key={pkg.id}
                      style={[s.card, selPkg === pkg.id && s.cardSel]}
                      onPress={() => buyPkg(pkg)}
                      activeOpacity={0.72}
                    >
                      <LinearGradient colors={bgC} style={s.cardIn}>
                        {/* icon */}
                        <View style={s.cardIcoW}>
                          <Ionicons name={isDia ? 'diamond' : 'cafe'} size={30} color={isDia ? '#FFD700' : '#FF9500'} />
                          {isDia && bonusPct > 0 && (
                            <View style={s.bonusBdg}>
                              <Text style={s.bonusBdgTxt}>+{bonusPct}%</Text>
                            </View>
                          )}
                        </View>

                        {/* amount */}
                        <Text style={s.cardAmt}>{fmt(amt)}</Text>
                        {bonus && <Text style={s.cardOld}>{fmt(bonus)}</Text>}

                        {/* price / withdraw value */}
                        <View style={s.cardPrW}>
                          {isDia ? (
                            <Text style={s.cardPr}>{price(pkg.price)}</Text>
                          ) : (
                            <>
                              <Text style={s.cardPr}>{price(pkg.price)}</Text>
                              <Text style={s.cardWithdraw}>≈ {price(pkg.price)} payout</Text>
                            </>
                          )}
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* info */}
              <View style={s.info}>
                {[
                  ['card', '#FF2D55', 'Diamonds/Beans — Pay via Razorpay (UPI, Card, Net Banking)'],
                  ['wallet', '#4CD964', 'Add Money — top up via Razorpay, then buy with wallet balance'],
                  ['diamond', '#FFD700', 'Diamonds are used to send gifts to streamers'],
                  ['cafe', '#FF9500', 'Beans convert to real money — payout credited on 7th of next month'],
                  ['shield-checkmark', '#4CD964', 'All payments secured by Razorpay'],
                ].map(([ico, col, txt], i) => (
                  <View key={i} style={s.infoR}>
                    <Ionicons name={ico as any} size={14} color={col as string} />
                    <Text style={s.infoT}>{txt}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            /* ══ TOP-UP HELPER ══ */
            <>
              {/* banner */}
              <View style={s.hBan}>
                <View style={s.hBanIco}>
                  <Ionicons name="bulb" size={18} color="#FF9500" />
                </View>
                <Text style={s.hBanTxt}>
                  There are more discounts for recharging through helpers. You can contact them directly.{'\n'}
                  It's recommended to ask the helper to transfer diamonds before you make the payment.
                </Text>
              </View>

              {/* list */}
              <View style={s.hList}>
                {TOPUP_HELPERS.map((h, i) => (
                  <TouchableOpacity
                    key={h.id}
                    style={[s.hItem, i < TOPUP_HELPERS.length - 1 && s.hItemBrd]}
                    onPress={() => tapHelper(h)}
                    activeOpacity={0.65}
                  >
                    <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={s.hAvatar}>
                      <Text style={s.hAvatarTxt}>{h.name[0]}</Text>
                    </LinearGradient>
                    <View style={s.hInfo}>
                      <View style={s.hNameRow}>
                        <Text style={s.hName} numberOfLines={1}>{h.name}</Text>
                        {h.verified && <Ionicons name="checkmark-circle" size={14} color="#4CD964" />}
                      </View>
                      <View style={s.hMeta}>
                        <Text style={{ fontSize: 14 }}>{h.country}</Text>
                        <View style={s.hIdBdg}><Text style={s.hIdTxt}>{h.userId}</Text></View>
                        <View style={s.hRat}>
                          <Ionicons name="star" size={10} color="#FFD700" />
                          <Text style={s.hRatTxt}>{h.rating}</Text>
                        </View>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.18)" />
                  </TouchableOpacity>
                ))}
              </View>

              {/* agreement */}
              <View style={s.aRow}>
                <Ionicons name="checkmark-circle" size={17} color="#FF2D55" />
                <Text style={s.aTxt}>
                  Please agree to the{' '}
                  <Text style={s.aLink}>User Agreement</Text>
                  {' '}and{' '}
                  <Text style={s.aLink}>Privacy Policy</Text>
                  {' '}first!
                </Text>
              </View>
            </>
          )}
        </ScrollView>

        {/* bottom */}
        <TouchableOpacity
          style={s.btm}
          activeOpacity={0.7}
          onPress={() => appAlert('Recharge Status', 'No recent recharges found.')}
        >
          <Text style={s.btmTxt}>Check My Recharge Status</Text>
          <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.35)" />
        </TouchableOpacity>
      </View>

      {/* ══ PAYMENT MODAL ══ */}
      <Modal visible={showPayModal} transparent animationType="slide" onRequestClose={() => setShowPayModal(false)}>
        <TouchableOpacity style={s.mOv} activeOpacity={1} onPress={() => setShowPayModal(false)}>
          <View style={s.mCon} onStartShouldSetResponder={() => true}>
            <View style={s.mHdl} />
            <Text style={s.mTitle}>Payment Method</Text>
            <Text style={s.mSub}>Select your preferred payment method</Text>

            {PAYMENT_METHODS.map(m => (
              <TouchableOpacity
                key={m.id}
                style={[s.mOpt, payMethod === m.id && s.mOptOn]}
                onPress={() => { setPayMethod(m.id); setShowPayModal(false); }}
                activeOpacity={0.7}
              >
                <View style={s.mOptIco}>
                  <Ionicons name={m.icon} size={22} color={payMethod === m.id ? '#FF2D55' : 'rgba(255,255,255,0.45)'} />
                </View>
                <Text style={[s.mOptLbl, payMethod === m.id && { color: '#FF2D55' }]}>{m.label}</Text>
                {payMethod === m.id && <Ionicons name="checkmark-circle" size={22} color="#FF2D55" style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

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
        onAdd={async (amt) => {
          setShowAddMoney(false);
          const res = await addMoney(amt);
          if (res?.needsSetup) setShowSetupPayment(true);
        }}
        onLinkBank={() => { setShowAddMoney(false); setShowSetupPayment(true); }}
        busy={busy}
        currentBalance={walletBalance}
        linkedBank={paymentMethod}
      />

      <RazorpayCheckout
        checkout={checkout}
        onSuccess={handleTopupSuccess}
        onCancel={cancelTopup}
        onError={handleCheckoutError}
      />

      <WithdrawModal
        visible={showWithdraw}
        onClose={() => setShowWithdraw(false)}
        onWithdraw={async (amt) => {
          setShowWithdraw(false);
          await withdrawMoney(amt);
        }}
        onSetupPayment={() => { setShowWithdraw(false); setShowSetupPayment(true); }}
        busy={busy}
        withdrawInfo={withdrawInfo}
        minWithdraw={withdrawInfo?.minWithdraw ?? 500}
        paymentMethod={paymentMethod}
      />
    </View>
  );
}

// ════════════════════════════════════════
// STYLES
// ════════════════════════════════════════
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08080C' },

  // ── header ──
  hdr: { paddingTop: 46, paddingBottom: 16, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 },
  navBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'center' },

  inrBal: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 10,
  },
  inrLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  inrVal: { color: '#FFF', fontSize: 16, fontWeight: '800', flex: 1 },

  bal: { alignItems: 'center', marginBottom: 12, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  balVal: { color: '#FFF', fontSize: 38, fontWeight: '900', letterSpacing: -1, textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },

  curTog: { flexDirection: 'row', marginHorizontal: 24, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 14, padding: 3 },
  curBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 11 },
  curBtnOn: { backgroundColor: 'rgba(255,255,255,0.2)' },
  curBtnTxt: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '700' },
  curBtnTxtOn: { color: '#FFF' },

  // ── body ──
  body: { flex: 1 },

  stRow: { flexDirection: 'row', marginHorizontal: 24, marginTop: 14, marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 3, position: 'relative', overflow: 'hidden' },
  stInd: { position: 'absolute', top: 3, left: 3, width: (SW - 48 - 6) / 2, height: '100%', backgroundColor: 'rgba(255,45,85,0.12)', borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,45,85,0.2)' },
  stBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, zIndex: 1 },
  stTxt: { color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: '700' },
  stTxtOn: { color: '#FF2D55' },

  scr: { paddingHorizontal: 24, paddingBottom: 20 },

  // ── payment selector ──
  pay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  payDisabled: { opacity: 0.55, backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.04)' },
  payLblDisabled: { color: 'rgba(255,255,255,0.45)' },
  payL: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  payIco: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,45,85,0.1)', alignItems: 'center', justifyContent: 'center' },
  payLbl: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  payR: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  payChg: { color: '#FF2D55', fontSize: 13, fontWeight: '700' },

  // ── packages ──
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: CARD_W, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  cardSel: { borderColor: '#FF2D55', borderWidth: 2 },
  cardIn: { paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center' },
  cardIcoW: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 6, position: 'relative' },
  bonusBdg: { position: 'absolute', top: -4, right: -14, backgroundColor: '#FF2D55', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 6 },
  bonusBdgTxt: { color: '#FFF', fontSize: 8, fontWeight: '800' },
  cardAmt: { color: '#FFF', fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  cardOld: { color: 'rgba(255,255,255,0.28)', fontSize: 11, fontWeight: '600', textDecorationLine: 'line-through', marginTop: 1 },
  cardPrW: { marginTop: 8, backgroundColor: 'rgba(255,45,85,0.1)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, width: '100%', alignItems: 'center' },
  cardPr: { color: '#FF2D55', fontSize: 13, fontWeight: '800' },
  cardWithdraw: { color: 'rgba(255,149,0,0.85)', fontSize: 10, fontWeight: '700', marginTop: 2 },

  // ── info ──
  info: { marginTop: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  infoR: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoT: { color: 'rgba(255,255,255,0.38)', fontSize: 12, fontWeight: '500', flex: 1, lineHeight: 17 },

  // ── helper tab ──
  hBan: { flexDirection: 'row', backgroundColor: 'rgba(255,149,0,0.08)', borderRadius: 14, padding: 12, gap: 10, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,149,0,0.15)' },
  hBanIco: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,149,0,0.15)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  hBanTxt: { color: '#FF9500', fontSize: 12, fontWeight: '500', lineHeight: 18, flex: 1 },

  hList: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', overflow: 'hidden' },
  hItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  hItemBrd: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  hAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  hAvatarTxt: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  hInfo: { flex: 1 },
  hNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  hName: { color: '#FFF', fontSize: 14, fontWeight: '700', maxWidth: '80%' },
  hMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hIdBdg: { backgroundColor: '#FF2D55', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  hIdTxt: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  hRat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  hRatTxt: { color: '#FFD700', fontSize: 11, fontWeight: '700' },

  aRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16, paddingHorizontal: 4 },
  aTxt: { color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: '500', lineHeight: 18, flex: 1 },
  aLink: { color: '#FF2D55', fontWeight: '700' },

  // ── bottom ──
  btm: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16, paddingBottom: 30, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' },
  btmTxt: { color: 'rgba(255,255,255,0.42)', fontSize: 13, fontWeight: '600' },

  // ── payment modal ──
  mOv: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  mCon: { backgroundColor: '#12121A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  mHdl: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 },
  mTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  mSub: { color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', marginBottom: 20 },
  mOpt: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 14, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  mOptOn: { backgroundColor: 'rgba(255,45,85,0.08)', borderColor: 'rgba(255,45,85,0.2)' },
  mOptIco: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  mOptLbl: { color: 'rgba(255,255,255,0.55)', fontSize: 15, fontWeight: '600' },
});
