import { useCallback, useEffect, useState } from "react";
import {
  getShareSettings,
  saveShareSettings,
  getEffectivePromoCaption,
  DEFAULT_PROMO_CAPTION,
} from "@/lib/db";
import type { ShareSettingsRow } from "@/lib/db";

export function useShareSettings() {
  const [settings, setSettings] = useState<ShareSettingsRow | null>(null);
  const [effectiveCaption, setEffectiveCaption] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const raw = await getShareSettings();
      const caption = await getEffectivePromoCaption();
      setSettings(raw);
      setEffectiveCaption(caption);
    } catch (e) {
      if (__DEV__) console.warn("Failed to load share settings:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    reload();
  }, [reload]);

  const update = useCallback(
    async (partial: Partial<Omit<ShareSettingsRow, "id">>) => {
      await saveShareSettings(partial);
      await reload();
    },
    [reload]
  );

  return {
    settings,
    effectiveCaption,
    loading,
    reload,
    update,
    DEFAULT_PROMO_CAPTION,
  };
}
