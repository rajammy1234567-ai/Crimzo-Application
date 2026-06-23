import React, { useCallback, useEffect, useRef, useState } from 'react';
import AppDialog from '../components/AppDialog';
import {
  registerAppDialog,
  unregisterAppDialog,
  type AppAlertButton,
  type AppAlertPayload,
} from '../lib/appAlert';

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<AppAlertPayload | null>(null);
  const queueRef = useRef<AppAlertPayload[]>([]);
  const showingRef = useRef(false);

  const pump = useCallback(() => {
    if (showingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    showingRef.current = true;
    setCurrent(next);
    setVisible(true);
  }, []);

  const showDialog = useCallback((payload: AppAlertPayload) => {
    queueRef.current.push(payload);
    pump();
  }, [pump]);

  useEffect(() => {
    registerAppDialog(showDialog);
    return () => unregisterAppDialog();
  }, [showDialog]);

  const handleClose = useCallback((button?: AppAlertButton) => {
    if (!button && current?.options?.cancelable === false) return;

    setVisible(false);
    showingRef.current = false;

    setTimeout(() => {
      setCurrent(null);
      pump();
    }, 160);
  }, [current, pump]);

  return (
    <>
      {children}
      <AppDialog visible={visible} payload={current} onClose={handleClose} />
    </>
  );
}