import { useState, useCallback, useEffect } from 'react';
import { appAlert } from './appAlert';
import { Platform } from 'react-native';
import { apiGet, apiPost, apiDelete, ApiError } from './apiClient';
import { useAuth } from '../contexts/AuthContext';

import type { PaymentMethodInfo } from '../components/payments/SetupPaymentModal';
import type { WithdrawInfo } from '../components/payments/WithdrawModal';

export type WalletCheckoutData = {
  mode: 'razorpay' | 'dev_mock';
  checkoutKind: 'topup' | 'package';
  orderId: string;
  razorpayOrderId?: string;
  razorpayKeyId?: string;
  amount: number;
  amountInr?: number;
  currency: string;
  packageName: string;
  linkedBank?: PaymentMethodInfo;
  productType?: 'diamonds' | 'beans';
  diamonds?: number;
  beans?: number;
  paymentPrefs?: {
    method: 'upi' | 'netbanking' | 'card';
    showAllMethods?: boolean;
    upi_vpa?: string | null;
    bank_code?: string | null;
  };
  user: { email: string; name: string };
};

/** @deprecated alias */
export type TopupCheckoutData = WalletCheckoutData;

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
  const [checkout, setCheckout] = useState<WalletCheckoutData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodInfo | null>(null);
  const [hasVerifiedPayment, setHasVerifiedPayment] = useState(false);
  const [isPendingVerification, setIsPendingVerification] = useState(false);
  const [withdrawInfo, setWithdrawInfo] = useState<WithdrawInfo | null>(null);

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
    pendingTaskBeans?: number;
    totalBeans?: number;
    totalWithdrawableBeans?: number;
    withdrawableInr?: number;
  }) => {
    updateUser({
      wallet_balance: data.wallet_balance,
      diamonds: data.diamonds,
      beans: data.beans,
      pendingTaskBeans: data.pendingTaskBeans,
      totalBeans: data.totalBeans,
      totalWithdrawableBeans: data.totalWithdrawableBeans,
      withdrawableInr: data.withdrawableInr,
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
      appAlert('Login Required', 'Please log in first.');
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
      appAlert('Error', e instanceof ApiError ? e.message : 'Setup failed');
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
        appAlert('✅ Verified', 'Payment method active! You can now add money.');
        return true;
      }
      return false;
    } catch (e) {
      appAlert('Wrong OTP', e instanceof ApiError ? e.message : 'Verification failed');
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
      appAlert('OTP Sent', 'Check your email for new OTP');
      return { devHint: res.devHint };
    } catch (e) {
      appAlert('Error', e instanceof ApiError ? e.message : 'Could not resend OTP');
    } finally {
      setBusy(false);
    }
  }, [token]);

  const removePaymentMethod = useCallback(async () => {
    if (!token) return;
    return new Promise<void>((resolve) => {
      appAlert('Change Method', 'Remove current bank/UPI?', [
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
              appAlert('Error', e instanceof ApiError ? e.message : 'Failed');
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
      const via = method.display
        || (method.type === 'upi'
          ? `UPI (${method.upi_id})`
          : method.bank_name
            ? `${method.bank_name} •••• ${method.account_last4}`
            : 'Razorpay (UPI / Card / Net Banking)');
      appAlert(
        'Confirm Payment',
        `₹${amountInr.toLocaleString('en-IN')} — ${via}\n\nWill be added to your wallet. Proceed?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Yes, Pay', onPress: () => resolve(true) },
        ],
      );
    });

  const addMoney = useCallback(async (amountInr: number) => {
    if (!token) {
      appAlert('Login Required', 'Please log in first.');
      return { needsSetup: false };
    }

    setBusy(true);
    try {
      const data = await apiPost<WalletCheckoutData & { success?: boolean; code?: string }>(
        '/api/payments/topup/create-order',
        { amount: amountInr },
        token,
      );

      const method = data.linkedBank || paymentMethod;
      const confirmed = await confirmPayment(
        amountInr,
        method || { type: 'card', display: 'Razorpay Checkout', status: 'verified' },
      );
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
            appAlert(
              '✅ Money Added',
              `₹${verified.creditedInr?.toLocaleString('en-IN')} added to your wallet!\nBalance: ₹${verified.wallet_balance?.toLocaleString('en-IN')}`,
            );
          }
        } catch (e) {
          appAlert('Error', e instanceof ApiError ? e.message : 'Payment failed');
        } finally {
          setBusy(false);
        }
        return { needsSetup: false };
      }

      setCheckout({ ...data, checkoutKind: 'topup' });
      return { needsSetup: false };
    } catch (e) {
      if (e instanceof ApiError) {
        const code = (e.data as { code?: string })?.code;
        if (code === 'PAYMENT_NOT_VERIFIED' || code === 'BANK_NOT_LINKED') {
          return { needsSetup: true };
        }
        appAlert('Error', e.message);
      } else {
        appAlert('Error', 'Could not start payment');
      }
      return { needsSetup: false };
    } finally {
      setBusy(false);
    }
  }, [token, syncBalances, hasVerifiedPayment, paymentMethod, isPendingVerification]);

  const buyWithRazorpay = useCallback(async (
    packageId: number,
    productType: 'diamonds' | 'beans' = 'diamonds',
  ): Promise<boolean> => {
    if (!token) {
      appAlert('Login Required', 'Please log in first.');
      return false;
    }

    setBusy(true);
    try {
      const data = await apiPost<WalletCheckoutData & { success?: boolean }>(
        '/api/payments/create-order',
        { packageId, productType },
        token,
      );

      if (data.mode === 'dev_mock') {
        const verified = await apiPost<{
          success?: boolean;
          credited?: number;
          productType?: string;
          diamonds?: number;
          beans?: number;
        }>('/api/payments/verify', { orderId: data.orderId, devMock: true }, token);
        if (verified.success) {
          syncBalances(verified);
          appAlert(
            '✅ Purchase Successful',
            `+${verified.credited?.toLocaleString()} ${verified.productType} added!`,
          );
          return true;
        }
        return false;
      }

      setCheckout({ ...data, checkoutKind: 'package', productType });
      return true;
    } catch (e) {
      appAlert('Error', e instanceof ApiError ? e.message : 'Could not start payment');
      return false;
    } finally {
      setBusy(false);
    }
  }, [token, syncBalances]);

  const handleCheckoutSuccess = useCallback(async (payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => {
    if (!token || !checkout) return;

    setBusy(true);
    try {
      if (checkout.checkoutKind === 'package') {
        const verified = await apiPost<{
          success?: boolean;
          credited?: number;
          productType?: string;
          diamonds?: number;
          beans?: number;
        }>(
          '/api/payments/verify',
          {
            orderId: checkout.orderId,
            razorpay_order_id: payload.razorpay_order_id,
            razorpay_payment_id: payload.razorpay_payment_id,
            razorpay_signature: payload.razorpay_signature,
          },
          token,
        );
        if (verified.success) {
          syncBalances(verified);
          appAlert(
            '✅ Payment Successful',
            `+${verified.credited?.toLocaleString()} ${verified.productType} added to your account!`,
          );
        }
      } else {
        const verified = await apiPost<TopupVerifyResponse>(
          '/api/payments/topup/verify',
          {
            orderId: checkout.orderId,
            razorpay_order_id: payload.razorpay_order_id,
            razorpay_payment_id: payload.razorpay_payment_id,
            razorpay_signature: payload.razorpay_signature,
          },
          token,
        );
        if (verified.success) {
          syncBalances(verified);
          appAlert(
            '✅ Money Added',
            `₹${verified.creditedInr?.toLocaleString('en-IN')} added to your wallet!`,
          );
        }
      }
    } catch (e) {
      appAlert('Error', e instanceof ApiError ? e.message : 'Verification failed');
    } finally {
      setBusy(false);
      setCheckout(null);
    }
  }, [token, checkout, syncBalances]);

  const handleTopupSuccess = handleCheckoutSuccess;

  const handleCheckoutError = useCallback((message: string) => {
    setCheckout(null);
    appAlert('Payment Failed', message);
  }, []);

  const cancelCheckout = useCallback(() => {
    setCheckout(null);
    if (Platform.OS !== 'web') {
      appAlert('Cancelled', 'Payment was cancelled.');
    }
  }, []);

  const cancelTopup = cancelCheckout;

  const buyWithWallet = useCallback(async (
    packageId: number,
    productType: 'diamonds' | 'beans' = 'diamonds',
  ): Promise<boolean> => {
    if (!token) {
      appAlert('Login Required', 'Please log in first.');
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
        appAlert(
          '✅ Purchase Successful',
          `${res.credited?.toLocaleString()} ${res.productType} added!\nSpent: ₹${res.spentInr?.toLocaleString('en-IN')} from wallet`,
        );
        return true;
      }
      return false;
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        const data = e.data as PurchaseResponse;
        appAlert(
          'Insufficient Balance',
          `You need ₹${data.required?.toLocaleString('en-IN')} but only have ₹${data.available?.toLocaleString('en-IN')}.\n\nPlease add money first.`,
          [
            { text: 'OK' },
            {
              text: 'Add Money',
              onPress: () => addMoney(data.shortfall || data.required || 500),
            },
          ],
        );
      } else {
        appAlert('Error', e instanceof ApiError ? e.message : 'Purchase failed');
      }
      return false;
    } finally {
      setBusy(false);
    }
  }, [token, syncBalances, addMoney]);

  const loadWithdrawInfo = useCallback(async () => {
    if (!token) return null;
    try {
      const res = await apiGet<WithdrawInfo & { success?: boolean }>('/api/payments/withdraw/info', token);
      if (res.success) {
        setWithdrawInfo(res);
        updateUser({
          beans: res.beans,
          pendingTaskBeans: res.pendingTaskBeans,
          totalBeans: res.totalBeans,
          totalWithdrawableBeans: res.totalWithdrawableBeans,
          withdrawableInr: res.withdrawableInr,
          diamonds: res.diamonds,
        });
        return res;
      }
    } catch {
      // non-fatal
    }
    return null;
  }, [token, updateUser]);

  const withdrawMoney = useCallback(async (amountInr: number) => {
    if (!token) {
      appAlert('Login Required', 'Please log in first.');
      return false;
    }

    const { buildWithdrawCreditMessage } = await import('./withdrawSchedule');
    const creditPreview = buildWithdrawCreditMessage(amountInr);
    const payoutLabel = paymentMethod?.display || 'your verified bank/UPI';
    const confirmed = await new Promise<boolean>((resolve) => {
      appAlert(
        'Confirm Withdrawal',
        `${creditPreview}\n\nPayout destination: ${payoutLabel}\n\nYour request will be saved for admin review.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Confirm', onPress: () => resolve(true) },
        ],
      );
    });
    if (!confirmed) return false;

    setBusy(true);
    try {
      const res = await apiPost<{
        success?: boolean;
        diamonds?: number;
        beans?: number;
        diamondsConverted?: number;
        beansUsed?: number;
        message?: string;
        creditMessage?: string;
        scheduledCreditLabel?: string;
        status?: string;
        payoutTo?: string;
        utr?: string | null;
        minWithdraw?: number;
        availableInr?: number;
      }>('/api/payments/withdraw', { amount: amountInr }, token);
      if (res.success) {
        syncBalances({ diamonds: res.diamonds, beans: res.beans });
        const convertedNote = res.diamondsConverted
          ? `\n\n${res.diamondsConverted.toLocaleString()} diamonds converted to beans for withdrawal.`
          : '';
        const payoutNote = res.payoutTo ? `\n\nAccount: ${res.payoutTo}` : '';
        const creditNote = res.creditMessage
          || (res.scheduledCreditLabel
            ? `Your amount will be credited on ${res.scheduledCreditLabel}.`
            : '');
        appAlert(
          '📋 Withdrawal Submitted',
          `${creditNote}${payoutNote}\n\nSaved in admin panel for review.${convertedNote}`,
        );
        await loadWithdrawInfo();
        return true;
      }
      return false;
    } catch (e) {
      if (e instanceof ApiError) {
        const data = e.data as { minWithdraw?: number; availableInr?: number };
        const extra = data.minWithdraw ? `\n\nMinimum: ₹${data.minWithdraw}` : '';
        const avail = data.availableInr != null ? `\nAvailable: ₹${data.availableInr.toLocaleString('en-IN')}` : '';
        appAlert('Cannot Withdraw', e.message + extra + avail);
      } else {
        appAlert('Error', 'Withdrawal failed');
      }
      return false;
    } finally {
      setBusy(false);
    }
  }, [token, syncBalances, loadWithdrawInfo, paymentMethod]);

  return {
    busy,
    checkout,
    topupCheckout: checkout,
    paymentMethod,
    linkedBank: paymentMethod,
    hasVerifiedPayment,
    hasLinkedBank: hasVerifiedPayment,
    isPendingVerification,
    addMoney,
    buyWithWallet,
    buyWithRazorpay,
    withdrawMoney,
    withdrawInfo,
    loadWithdrawInfo,
    setupPaymentMethod,
    verifyPaymentOtp,
    resendPaymentOtp,
    removePaymentMethod,
    unlinkBank: removePaymentMethod,
    linkBank: setupPaymentMethod,
    refreshBank: refreshPaymentMethod,
    refreshPaymentMethod,
    handleCheckoutSuccess,
    handleTopupSuccess,
    handleCheckoutError,
    cancelCheckout,
    cancelTopup,
    closeTopup: () => setCheckout(null),
  };
}