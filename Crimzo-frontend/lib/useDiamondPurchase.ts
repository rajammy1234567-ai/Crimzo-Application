import { useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { apiPost, ApiError } from './apiClient';
import { useAuth } from '../contexts/AuthContext';

export type PaymentCheckoutData = {
  mode: 'razorpay' | 'dev_mock';
  orderId: string;
  razorpayOrderId?: string;
  mockOrderId?: string;
  razorpayKeyId?: string;
  amount: number;
  currency: string;
  packageName: string;
  diamonds: number;
  beans: number;
  user: { email: string; name: string };
};

type CreateOrderResponse = PaymentCheckoutData & { success?: boolean };

type VerifyResponse = {
  success?: boolean;
  diamonds?: number;
  beans?: number;
  credited?: number;
  productType?: 'diamonds' | 'beans';
  mode?: string;
};

export function useDiamondPurchase() {
  const { token, user, updateUser } = useAuth();
  const [paying, setPaying] = useState(false);
  const [checkout, setCheckout] = useState<PaymentCheckoutData | null>(null);

  const startPurchase = useCallback(async (
    packageId: number,
    productType: 'diamonds' | 'beans' = 'diamonds',
  ) => {
    if (!token) {
      Alert.alert('Login Required', 'Please log in to purchase.');
      return;
    }

    setPaying(true);
    try {
      const data = await apiPost<CreateOrderResponse>(
        '/api/payments/create-order',
        { packageId, productType },
        token,
      );

      if (data.mode === 'dev_mock') {
        Alert.alert(
          'Test Payment',
          'Razorpay keys not configured. Use test mode to credit diamonds without real payment?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Test Pay',
              onPress: async () => {
                try {
                  setPaying(true);
                  const verified = await apiPost<VerifyResponse>(
                    '/api/payments/verify',
                    { orderId: data.orderId, devMock: true },
                    token,
                  );
                  if (verified.success) {
                    updateUser({
                      diamonds: verified.diamonds,
                      beans: verified.beans,
                    });
                    Alert.alert(
                      '✅ Success',
                      `+${verified.credited?.toLocaleString()} ${verified.productType} added to your wallet!`,
                    );
                  }
                } catch (e) {
                  const msg = e instanceof ApiError ? e.message : 'Payment failed';
                  Alert.alert('Error', msg);
                } finally {
                  setPaying(false);
                }
              },
            },
          ],
        );
        return;
      }

      setCheckout(data);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not start payment';
      Alert.alert('Payment Error', msg);
    } finally {
      setPaying(false);
    }
  }, [token, updateUser]);

  const closeCheckout = useCallback(() => {
    setCheckout(null);
  }, []);

  const handlePaymentSuccess = useCallback(async (payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => {
    if (!token || !checkout) return;

    setPaying(true);
    try {
      const verified = await apiPost<VerifyResponse>(
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
        updateUser({
          diamonds: verified.diamonds,
          beans: verified.beans,
        });
        Alert.alert(
          '✅ Payment Successful',
          `+${verified.credited?.toLocaleString()} ${verified.productType} added to your wallet!`,
        );
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Verification failed';
      Alert.alert('Payment Error', msg);
    } finally {
      setPaying(false);
      setCheckout(null);
    }
  }, [token, checkout, updateUser]);

  const handlePaymentError = useCallback((message: string) => {
    setCheckout(null);
    Alert.alert('Payment Failed', message);
  }, []);

  const handlePaymentCancel = useCallback(() => {
    setCheckout(null);
    if (Platform.OS !== 'web') {
      Alert.alert('Cancelled', 'Payment was cancelled.');
    }
  }, []);

  return {
    paying,
    checkout,
    startPurchase,
    closeCheckout,
    handlePaymentSuccess,
    handlePaymentError,
    handlePaymentCancel,
  };
}