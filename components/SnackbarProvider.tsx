import React, { createContext, useCallback, useContext, useState } from "react";
import { Snackbar } from "react-native-paper";

type SnackAction = { label: string; onPress?: () => void };

type SnackbarContextValue = {
  showSnack: (message: string, action?: SnackAction) => void;
};

const SnackbarContext = createContext<SnackbarContextValue>({
  showSnack: () => {},
});

export function useSnackbar() {
  return useContext(SnackbarContext);
}

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<SnackAction | undefined>();

  const showSnack = useCallback((msg: string, act?: SnackAction) => {
    setMessage(msg);
    setAction(act);
  }, []);

  const dismiss = useCallback(() => {
    setMessage("");
    setAction(undefined);
  }, []);

  return (
    <SnackbarContext.Provider value={{ showSnack }}>
      {children}
      <Snackbar
        visible={!!message}
        onDismiss={dismiss}
        duration={3000}
        action={action}
      >
        {message}
      </Snackbar>
    </SnackbarContext.Provider>
  );
}
