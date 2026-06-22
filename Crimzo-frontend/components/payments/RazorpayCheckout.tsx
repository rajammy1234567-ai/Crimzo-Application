import React, { useEffect, useRef, useCallback } from 'react';
import { Modal, View, StyleSheet, ActivityIndicator, Platform, Linking } from 'react-native';
import { WebView } from 'react-native-webview';

const ALLOWED_WEB_SCHEMES = ['http', 'https', 'about', 'data', 'blob', 'file'];

function shouldOpenExternally(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.startsWith('intent://')) return true;
  const scheme = lower.split(':')[0];
  return !ALLOWED_WEB_SCHEMES.includes(scheme);
}

async function openExternalPaymentUrl(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    if (url.startsWith('intent://')) {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return true;
      }
      const fallbackMatch = url.match(/S\.browser_fallback_url=([^;]+)/i);
      if (fallbackMatch?.[1]) {
        const fallback = decodeURIComponent(fallbackMatch[1]);
        await Linking.openURL(fallback);
        return true;
      }
      return false;
    }
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
export type RazorpayCheckoutData = {
  mode: 'razorpay' | 'dev_mock';
  orderId: string;
  razorpayOrderId?: string;
  razorpayKeyId?: string;
  amount: number;
  currency: string;
  packageName: string;
  linkedBank?: {
    bank_name?: string | null;
    account_last4?: string | null;
    account_holder_name?: string | null;
  };
  paymentPrefs?: {
    method: 'upi' | 'netbanking' | 'card';
    upi_vpa?: string | null;
    bank_code?: string | null;
    showAllMethods?: boolean;
  };
  user: { email: string; name: string };
};

type Props = {
  checkout: RazorpayCheckoutData | null;
  onSuccess: (payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  onCancel: () => void;
};

function buildCheckoutHtml(checkout: RazorpayCheckoutData): string {
  const keyId = checkout.razorpayKeyId || '';
  const orderId = checkout.razorpayOrderId || '';
  const amount = checkout.amount;
  const name = checkout.user.name.replace(/'/g, "\\'");
  const email = checkout.user.email.replace(/'/g, "\\'");
  const description = checkout.packageName.replace(/'/g, "\\'");
  const prefs = checkout.paymentPrefs;
  const upiVpa = prefs?.upi_vpa ? prefs.upi_vpa.replace(/'/g, "\\'") : '';
  const bankCode = prefs?.bank_code || '';
  const useUpi = prefs?.method === 'upi' && upiVpa && !prefs?.showAllMethods;
  let configBlock = '';
  if (prefs?.showAllMethods) {
    const seq = prefs.method === 'card'
      ? "['block.card','block.upi','block.banks']"
      : prefs.method === 'upi'
        ? "['block.upi','block.card','block.banks']"
        : "['block.banks','block.upi','block.card']";
    configBlock = `config: {
        display: {
          blocks: {
            upi: { name: 'UPI — GPay, PhonePe, Paytm', instruments: [{ method: 'upi' }] },
            card: { name: 'Credit / Debit Card', instruments: [{ method: 'card' }] },
            banks: { name: 'Net Banking', instruments: [{ method: 'netbanking'${bankCode ? `, banks: ['${bankCode}']` : ''} }] }
          },
          sequence: ${seq},
          preferences: { show_default_blocks: true }
        }
      },`;
  } else if (!useUpi && bankCode) {
    configBlock = `config: {
        display: {
          blocks: {
            banks: { name: 'Pay from linked bank', instruments: [{ method: 'netbanking', banks: ['${bankCode}'] }] }
          },
          sequence: ['block.banks'],
          preferences: { show_default_blocks: false }
        }
      },`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <style>
    body { margin:0; background:#0a0a0f; color:#fff; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; }
    .msg { text-align:center; padding:24px; }
  </style>
</head>
<body>
  <div class="msg">Opening secure payment...</div>
  <script>
    function post(msg) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
    }
    try {
      var options = {
        key: '${keyId}',
        amount: ${amount},
        currency: '${checkout.currency}',
        name: 'Crimzo',
        description: '${description}',
        order_id: '${orderId}',
        prefill: { name: '${name}', email: '${email}'${useUpi ? `, method: 'upi', vpa: '${upiVpa}'` : ''} },
        ${configBlock}
        theme: { color: '#FF2D55' },
        handler: function (response) {
          post({ type: 'success', data: response });
        },
        modal: {
          ondismiss: function () { post({ type: 'cancel' }); }
        }
      };
      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function (resp) {
        post({ type: 'error', message: (resp.error && resp.error.description) || 'Payment failed' });
      });
      rzp.open();
    } catch (e) {
      post({ type: 'error', message: e.message || 'Could not open Razorpay' });
    }
  </script>
</body>
</html>`;
}

export default function RazorpayCheckout({ checkout, onSuccess, onCancel }: Props) {
  const openedWeb = useRef(false);

  const handleExternalUrl = useCallback((url: string) => {
    if (!shouldOpenExternally(url)) return true;
    void openExternalPaymentUrl(url);
    return false;
  }, []);

  // Web: open Razorpay via script injection
  useEffect(() => {
    if (Platform.OS !== 'web' || !checkout || openedWeb.current) return;
    if (!checkout.razorpayKeyId || !checkout.razorpayOrderId) {
      onCancel();
      return;
    }
    openedWeb.current = true;

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      const RazorpayCtor = (window as any).Razorpay;
      if (!RazorpayCtor) {
        onCancel();
        return;
      }
      const prefs = checkout.paymentPrefs;
      const useUpi = prefs?.method === 'upi' && prefs?.upi_vpa && !prefs?.showAllMethods;
      const bankCode = prefs?.bank_code;
      const buildConfig = () => {
        if (!prefs?.showAllMethods) {
          if (!useUpi && bankCode) {
            return {
              display: {
                blocks: {
                  banks: {
                    name: 'Pay from linked bank',
                    instruments: [{ method: 'netbanking', banks: [bankCode] }],
                  },
                },
                sequence: ['block.banks'],
                preferences: { show_default_blocks: false },
              },
            };
          }
          return undefined;
        }
        const sequence = prefs.method === 'card'
          ? ['block.card', 'block.upi', 'block.banks']
          : prefs.method === 'upi'
            ? ['block.upi', 'block.card', 'block.banks']
            : ['block.banks', 'block.upi', 'block.card'];
        return {
          display: {
            blocks: {
              upi: { name: 'UPI — GPay, PhonePe, Paytm', instruments: [{ method: 'upi' }] },
              card: { name: 'Credit / Debit Card', instruments: [{ method: 'card' }] },
              banks: {
                name: 'Net Banking',
                instruments: [{ method: 'netbanking', ...(bankCode ? { banks: [bankCode] } : {}) }],
              },
            },
            sequence,
            preferences: { show_default_blocks: true },
          },
        };
      };
      const rzpOpts: Record<string, unknown> = {
        key: checkout.razorpayKeyId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: 'Crimzo',
        description: checkout.packageName,
        order_id: checkout.razorpayOrderId,
        prefill: {
          name: checkout.user.name,
          email: checkout.user.email,
          ...(useUpi ? { method: 'upi', vpa: prefs.upi_vpa } : {}),
        },
        theme: { color: '#FF2D55' },
      };
      const cfg = buildConfig();
      if (cfg) rzpOpts.config = cfg;
      const rzp = new RazorpayCtor({
        ...rzpOpts,
        handler: (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          onSuccess(response);
          openedWeb.current = false;
        },
        modal: {
          ondismiss: () => {
            onCancel();
            openedWeb.current = false;
          },
        },
      });
      rzp.open();
    };
    document.body.appendChild(script);

    return () => {
      openedWeb.current = false;
    };
  }, [checkout, onSuccess, onCancel]);

  if (!checkout || checkout.mode !== 'razorpay') return null;
  if (!checkout.razorpayKeyId || !checkout.razorpayOrderId) return null;

  if (Platform.OS === 'web') {
    return (
      <Modal visible transparent animationType="fade">
        <View style={styles.webOverlay}>
          <ActivityIndicator size="large" color="#FF2D55" />
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        <WebView
          originWhitelist={['*']}
          source={{ html: buildCheckoutHtml(checkout) }}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          mixedContentMode="always"
          setSupportMultipleWindows
          allowsInlineMediaPlayback
          onShouldStartLoadWithRequest={(request) => handleExternalUrl(request.url)}
          onNavigationStateChange={(navState) => {
            if (shouldOpenExternally(navState.url)) {
              void openExternalPaymentUrl(navState.url);
            }
          }}
          onMessage={(event) => {
            try {
              const msg = JSON.parse(event.nativeEvent.data);
              if (msg.type === 'success' && msg.data) {
                onSuccess(msg.data);
              } else if (msg.type === 'cancel') {
                onCancel();
              } else if (msg.type === 'error') {
                onCancel();
              }
            } catch {
              onCancel();
            }
          }}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color="#FF2D55" />
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0f',
  },
  webOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});