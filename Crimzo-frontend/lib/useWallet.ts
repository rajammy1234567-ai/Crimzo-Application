import { useState, useCallback, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { apiGet, apiPost, apiDelete, ApiError } from './apiClient';
import { useAuth } from '../contexts/AuthContext';
import type { PaymentMethodInfo } from '../components/payments/SetupPaymentModal';

export type TopupCheckoutData = {
  mode: 'razorpay' | 'dev_mock';
  orderId: string;
  razorpayOrderId?: string;
  razorpayKeyId?: string;
  amount: number;
  amountInr?: number;
  currency: string;
  packageName: string;
  linkedBank?: PaymentMethodInfo;
  paymentPrefs?: {
    method: 'upi' | 'netbanking' | 'card';
    showAllMethods?: boolean;
    upi_vpa?: string | null;
    bank_code?: string | null;
  };
  user: { email: string; name: string };
};

type TopupVerifyResponse = {
  success?: boolean;
  wallet_balance?: number;
  diamonds?: number;
  beans?: number;
  creditedInr?: number;
};

type PurchaseResponse = {
  success?: boolean;
  wallet_balance?: number;
  diamonds?: number;
  beans?: number;
  spentInr?: number;
  credited?: number;
  productType?: 'diamonds' | 'beans';
  error?: string;
  required?: number;
  available?: number;
  shortfall?: number;
};

export function useWallet() {
  const { token, updateUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [topupCheckout, setTopupCheckout] = useState<TopupCheckoutData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodInfo | null>(null);
  const [hasVerifiedPayment, setHasVerifiedPayment] = useState(false);
  const [isPendingVerification, setIsPendingVerification] = useState(false);

  const refreshPaymentMethod = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiGet<{
        paymentMethod?: PaymentMethodInfo | null;
        linked?: PaymentMethodInfo | null;
        hasVerifiedPayment?: boolean;
        hasLinkedBank?: boolean;
        isPendingVerification?: boolean;
      }>('/api/payments/method', token);
      const method = data.paymentMethod || data.linked || null;
      setPaymentMethod(method);
      setHasVerifiedPayment(!!(data.hasVerifiedPayment || data.hasLinkedBank));
      setIsPendingVerification(!!data.isPendingVerification);
    } catch {
      // non-fatal
    }
  }, [token]);

  useEffect(() => {
    refreshPaymentMethod();
  }, [refreshPaymentMethod]);

  const syncBalances = useCallback((data: {
    wallet_balance?: number;
    diamonds?: number;
    beans?: number;
  }) => {
    updateUser({
      wallet_balance: data.wallet_balance,
      diamonds: data.diamonds,
      beans: data.beans,
    });
  }, [updateUser]);

  const setupPaymentMethod = useCallback(async (payload: {
    type: 'bank' | 'upi' | 'card';
    account_holder_name: string;
    linked_phone: string;
    account_number?: string;
    ifsc?: string;
    upi_id?: string;
  }) => {
    if (!token) {
      Alert.alert('Login Required', 'Please log in first.');
      return { success: false };
    }
    setBusy(true);
    try {
      const res = await apiPost<{
        success?: boolean;
        paymentMethod?: PaymentMethodInfo;
        devHint?: string;
        emailMasked?: string;
      }>('/api/payments/method/setup', payload, token);
      if (res.paymentMethod) {
        setPaymentMethod(res.paymentMethod);
        setIsPendingVerification(true);
        setHasVerifiedPayment(false);
      }
      return {
        success: !!res.success,
        devHint: res.devHint,
        emailMasked: res.emailMasked,
      };
    } catch (e) {
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Setup failed');
      return { success: false };
    } finally {
      setBusy(false);
    }
  }, [token]);

  const verifyPaymentOtp = useCallback(async (otp: string): Promise<boolean> => {
    if (!token) return false;
    setBusy(true);
    try {
      const res = await apiPost<{
        success?: boolean;
        paymentMethod?: PaymentMethodInfo;
      }>('/api/payments/method/verify', { otp }, token);
      if (res.paymentMethod) {
        setPaymentMethod(res.paymentMethod);
        setHasVerifiedPayment(true);
        setIsPendingVerification(false);
        Alert.alert('✅ Verified', 'Payment method active! Ab Add Money kar sakte ho.');
        return true;
      }
      return false;
    } catch (e) {
      Alert.alert('Wrong OTP', e instanceof ApiError ? e.message : 'Verification failed');
      return false;
    } finally {
      setBusy(false);
    }
  }, [token]);

  const resendPaymentOtp = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      const res = await apiPost<{ devHint?: string }>('/api/payments/method/resend-otp', {}, token);
      Alert.alert('OTP Sent', 'Check your email for new OTP');
      return { devHint: res.devHint };
    } catch (e) {
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Could not resend OTP');
    } finally {
      setBusy(false);
    }
  }, [token]);

  const removePaymentMethod = useCallback(async () => {
    if (!token) return;
    return new Promise<void>((resolve) => {
      Alert.alert('Change Method', 'Remove current bank/UPI?', [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await apiDelete('/api/payments/method', token);
              setPaymentMethod(null);
              setHasVerifiedPayment(false);
              setIsPendingVerification(false);
            } catch (e) {
              Alert.alert('Error', e instanceof ApiError ? e.message : 'Failed');
            } finally {
              setBusy(false);
              resolve();
            }
          },
        },
      ]);
    });
  }, [token]);

  const confirmPayment = (amountInr: number, method: PaymentMethodInfo) =>
    new Promise<boolean>((resolve) => {
      const via = method.type === 'upi'
        ? `UPI (${method.upi_id})`
        : `${method.bank_name} •••• ${method.account_last4}`;
      Alert.alert(
        'Confirm Payment',
        `₹${amountInr.toLocaleString('en-IN')} ${method.type === 'upi' ? 'pay via' : 'debit from'}\n${via}\n\nWallet mein add hoga. Proceed?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Yes, Pay', onPress: () => resolve(true) },
        ],
      );
    });

  const addMoney = useCallback(async (amountInr: number) => {
    if (!token) {
      Alert.alert('Login Required', 'Please log in first.');
      return { needsSetup: false };
    }

    if (isPendingVerification) {
      return { needsSetup: true, needsOtp: true };
    }

    if (!hasVerifiedPayment || !paymentMethod) {
      return { needsSetup: true };
    }

    setBusy(true);
    try {
      const data = await apiPost<TopupCheckoutData & { success?: boolean; code?: string }>(
        '/api/payments/topup/create-order',
        { amount: amountInr },
        token,
      );

      const method = data.linkedBank || paymentMethod;
      const confirmed = await confirmPayment(amountInr, method);
      if (!confirmed) return { needsSetup: false };

      if (data.mode === 'dev_mock') {
        try {
          setBusy(true);
          const verified = await apiPost<TopupVerifyResponse>(
            '/api/payments/topup/verify',
            { orderId: data.orderId, devMock: true },
            token,
          );
          if (verified.success) {
            syncBalances(verified);
            Alert.alert(
              '✅ Money Added',
              `₹${verified.creditedInr?.toLocaleString('en-IN')} wallet mein add ho gaya!\nBalance: ₹${verified.wallet_balance?.toLocaleString('en-IN')}`,
            );
          }
        } catch (e) {
          Alert.alert('Error', e instanceof ApiError ? e.message : 'Payment failed');
        } finally {
          setBusy(false);
        }
        return { needsSetup: false };
      }

      setTopupCheckout(data);
      return { needsSetup: false };
    } catch (e) {
      if (e instanceof ApiError) {
        const code = (e.data as { code?: string })?.code;
        if (code === 'PAYMENT_NOT_VERIFIED' || code === 'BANK_NOT_LINKED') {
          return { needsSetup: true };
        }
        Alert.alert('Error', e.message);
      } else {
        Alert.alert('Error', 'Could not start payment');
      }
      return { needsSetup: false };
    } finally {
      setBusy(false);
    }
  }, [token, syncBalances, hasVerifiedPayment, paymentMethod, isPendingVerification]);

  const handleTopupSuccess = useCallback(async (payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => {
    if (!token || !topupCheckout) return;

    setBusy(true);
    try {
      const verified = await apiPost<TopupVerifyResponse>(
        '/api/payments/topup/verify',
        {
          orderId: topupCheckout.orderId,
          razorpay_order_id: payload.razorpay_order_id,
          razorpay_payment_id: payload.razorpay_payment_id,
          razorpay_signature: payload.razorpay_signature,
        },
        token,
      );

      if (verified.success) {
        syncBalances(verified);
        Alert.alert(
          '✅ Money Added',
          `₹${verified.creditedInr?.toLocaleString('en-IN')} wallet mein add ho gaya!`,
        );
      }
    } catch (e) {
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Verification failed');
    } finally {
      setBusy(false);
      setTopupCheckout(null);
    }
  }, [token, topupCheckout, syncBalances]);

  const cancelTopup = useCallback(() => {
    setTopupCheckout(null);
    if (Platform.OS !== 'web') {
      Alert.alert('Cancelled', 'Payment cancelled.');
    }
  }, []);

  const buyWithWallet = useCallback(async (
    packageId: number,
    productType: 'diamonds' | 'beans' = 'diamonds',
  ): Promise<boolean> => {
    if (!token) {
      Alert.alert('Login Required', 'Please log in first.');
      return false;
    }

    setBusy(true);
    try {
      const res = await apiPost<PurchaseResponse>(
        '/api/payments/purchase',
        { packageId, productType },
        token,
      );

      if (res.success) {
        syncBalances(res);
        Alert.alert(
          '✅ Purchase Successful',
          `${res.credited?.toLocaleString()} ${res.productType} added!\nSpent: ₹${res.spentInr?.toLocaleString('en-IN')} from wallet`,
        );
        return true;
      }
      return false;
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        const data = e.data as PurchaseResponse;
        Alert.alert(
          'Insufficient Balance',
          `You need ₹${data.required?.toLocaleString('en-IN')} but only have ₹${data.available?.toLocaleString('en-IN')}.\n\nPehle Add Money karo.`,
          [
            { text: 'OK' },
            {
              text: 'Add Money',
              onPress: () => addMoney(data.shortfall || data.required || 500),
            },
          ],
        );
      } else {
        Alert.alert('Error', e instanceof ApiError ? e.message : 'Purchase failed');
      }
      return false;
    } finally {
      setBusy(false);
    }
  }, [token, syncBalances, addMoney]);

  const withdrawMoney = useCallback(async (amountInr: number) => {
    if (!token) {
      Alert.alert('Login Required', 'Please log in first.');
      return false;
    }
    setBusy(true);
    try {
      const res = await apiPost<{
        success?: boolean;
        wallet_balance?: number;
        message?: string;
        minWithdraw?: number;
      }>('/api/payments/withdraw', { amount: amountInr }, token);
      if (res.success) {
        syncBalances({ wallet_balance: res.wallet_balance });
        Alert.alert('✅ Withdrawal', res.message || 'Withdrawal submitted');
        return true;
      }
      return false;
    } catch (e) {
      if (e instanceof ApiError) {
        const data = e.data as { minWithdraw?: number };
        Alert.alert('Cannot Withdraw', e.message + (data.minWithdraw ? `\n\nMinimum: ₹${data.minWithdraw}` : ''));
      } else {
        Alert.alert('Error', 'Withdrawal failed');
      }
      return false;
    } finally {
      setBusy(false);
    }
  }, [token, syncBalances]);

  return {
    busy,
    topupCheckout,
    paymentMethod,
    linkedBank: paymentMethod,
    hasVerifiedPayment,
    hasLinkedBank: hasVerifiedPayment,
    isPendingVerification,
    addMoney,
    buyWithWallet,
    withdrawMoney,
    setupPaymentMethod,
    verifyPaymentOtp,
    resendPaymentOtp,
    removePaymentMethod,
    unlinkBank: removePaymentMethod,
    linkBank: setupPaymentMethod,
    refreshBank: refreshPaymentMethod,
    refreshPaymentMethod,
    handleTopupSuccess,
    cancelTopup,
    closeTopup: () => setTopupCheckout(null),
  };
}