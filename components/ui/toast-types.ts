export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  action?: ToastAction;
}

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  description?: string;
  action?: ToastAction;
  duration?: number;
}

export interface ToastContextType {
  toast: (toast: string | Omit<ToastData, 'id'>) => void;
  success: (title: string, options?: string | ToastOptions) => void;
  error: (title: string, options?: string | ToastOptions) => void;
  warning: (title: string, options?: string | ToastOptions) => void;
  info: (title: string, options?: string | ToastOptions) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}
