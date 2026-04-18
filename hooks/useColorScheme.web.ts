import { useState, useEffect } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";

/**
 * Re-calculate on the client side for web to support static rendering.
 * The setState in the hydration effect is intentional — it triggers one
 * rerender after mount so the server-rendered "light" is replaced by the
 * actual system color scheme.
 */
let hydrated = false;

export function useColorScheme() {
  const [, rerender] = useState(0);

  useEffect(() => {
    if (!hydrated) {
      hydrated = true;
      rerender((n) => n + 1); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, []);

  const colorScheme = useRNColorScheme();

  return hydrated ? colorScheme : "light";
}
