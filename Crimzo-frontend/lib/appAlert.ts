import { Alert } from 'react-native';

export type AppAlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export type AppAlertOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
};

export type AppAlertVariant = 'info' | 'success' | 'warning' | 'error' | 'confirm';

export type AppAlertPayload = {
  title: string;
  message?: string;
  buttons?: AppAlertButton[];
  options?: AppAlertOptions;
  variant?: AppAlertVariant;
};

type ShowDialogFn = (payload: AppAlertPayload) => void;

let showDialogImpl: ShowDialogFn | null = null;

export function registerAppDialog(fn: ShowDialogFn) {
  showDialogImpl = fn;
}

export function unregisterAppDialog() {
  showDialogImpl = null;
}

function inferVariant(title: string, buttons?: AppAlertButton[]): AppAlertVariant {
  const t = title.toLowerCase();
  if (t.includes('delete') || t.includes('logout') || t.includes('end battle') || t.includes('block')) {
    return 'confirm';
  }
  if (
    t.includes('error') ||
    t.includes('failed') ||
    t.includes('declined') ||
    t.includes('ended') ||
    t.includes('suspended')
  ) {
    return 'error';
  }
  if (
    t.includes('uploaded') ||
    t.includes('success') ||
    t.includes('copied') ||
    t.includes('accepted') ||
    t.includes('connected') ||
    t.includes('✨') ||
    t.includes('🎬')
  ) {
    return 'success';
  }
  if (
    t.includes('permission') ||
    t.includes('login required') ||
    t.includes('recharge') ||
    t.includes('follow') ||
    t.includes('invalid') ||
    t.includes('weak') ||
    t.includes('mismatch') ||
    t.includes('private') ||
    t.includes('no answer') ||
    t.includes('balance')
  ) {
    return 'warning';
  }
  if (buttons?.some((b) => b.style === 'destructive')) return 'confirm';
  return 'info';
}

/** Drop-in styled replacement for `Alert.alert`. */
export function appAlert(
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
  options?: AppAlertOptions,
): void {
  const payload: AppAlertPayload = {
    title,
    message: message || undefined,
    buttons: buttons?.length ? buttons : [{ text: 'OK' }],
    options,
    variant: inferVariant(title, buttons),
  };

  if (showDialogImpl) {
    showDialogImpl(payload);
    return;
  }

  Alert.alert(title, message, buttons, options);
}