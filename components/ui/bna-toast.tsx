/* eslint-disable */
import React, { createContext, useCallback, useContext, useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Toast } from './toast-item';
import type { ToastData, ToastVariant, ToastOptions, ToastContextType } from './toast-types';
export type { ToastVariant, ToastData } from './toast-types';

const ToastContext = createContext<ToastContextType | null>(null);

// BLD-569: anchored at bottom of screen so toasts sit near the primary
// action area (set-complete button / FAB) rather than in peripheral vision.
// Per-toast bottom offset + safe-area insets are applied in `toast-item.tsx`.
const containerStyle: ViewStyle = { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1000, pointerEvents: 'box-none' };

export function ToastProvider({ children, maxToasts = 3 }: { children: React.ReactNode; maxToasts?: number }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const dismissToast = useCallback((id: string) => { setToasts((prev) => prev.filter((t) => t.id !== id)); }, []);
  const dismissAll = useCallback(() => { setToasts([]); }, []);

  const addToast = useCallback((toastData: string | Omit<ToastData, 'id'>) => {
    const data = typeof toastData === 'string' ? { title: toastData } : toastData;
    const id = Math.random().toString(36).substr(2, 9);
    const toast: ToastData = { ...data, id, duration: data.duration ?? 4000 };
    setToasts((prev) => [toast, ...prev].slice(0, maxToasts));
    if (toast.duration && toast.duration > 0) setTimeout(() => dismissToast(id), toast.duration);
  }, [maxToasts, dismissToast]);

  const variant = useCallback((v: ToastVariant, title: string, options?: string | ToastOptions) => {
    const opts = typeof options === 'string' ? { description: options } : options;
    addToast({ title, description: opts?.description, variant: v, action: opts?.action, duration: opts?.duration });
  }, [addToast]);

  const ctx: ToastContextType = {
    toast: addToast, dismiss: dismissToast, dismissAll,
    success: (t, o) => variant('success', t, o),
    error: (t, o) => variant('error', t, o),
    warning: (t, o) => variant('warning', t, o),
    info: (t, o) => variant('info', t, o),
  };

  return (
    <ToastContext.Provider value={ctx}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {children}
        <View style={containerStyle} pointerEvents='box-none'>
          {toasts.map((t, i) => <Toast key={t.id} {...t} index={i} onDismiss={dismissToast} />)}
        </View>
      </GestureHandlerRootView>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
