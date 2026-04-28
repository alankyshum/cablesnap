import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getAppSetting, getBodySettings, setAppSetting } from "../lib/db";
import {
  solve,
  perSide,
  summarize,
  KG_PLATES,
  LB_PLATES,
  KG_BARS,
  LB_BARS,
} from "../lib/plates";

const DEFAULT_BAR_BY_UNIT: Record<"kg" | "lb", number> = {
  kg: 20,
  lb: 45,
};

function getBarSettingKey(unit: "kg" | "lb") {
  return `plate_calculator_bar_${unit}`;
}

export function usePlateCalculator(initialWeight?: string) {
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [target, setTarget] = useState(initialWeight ?? "");
  const [bar, setBar] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [ready, setReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const body = await getBodySettings();
          const nextUnit = body.weight_unit;
          const nextPresets = nextUnit === "kg" ? KG_BARS : LB_BARS;
          const storedBar = await getAppSetting(getBarSettingKey(nextUnit));
          const parsedStoredBar = storedBar == null ? Number.NaN : parseFloat(storedBar);
          if (!active) return;
          setUnit(nextUnit);
          if (!Number.isNaN(parsedStoredBar) && parsedStoredBar > 0) {
            if ((nextPresets as readonly number[]).includes(parsedStoredBar)) {
              setBar(parsedStoredBar);
              setCustom("");
            } else {
              setBar(null);
              setCustom(storedBar!);
            }
          } else {
            setBar(DEFAULT_BAR_BY_UNIT[nextUnit]);
            setCustom("");
          }
          if (initialWeight) setTarget(initialWeight);
        } catch {
          if (!active) return;
          // Fall back to defaults if settings unavailable
          setUnit("kg");
          setBar(DEFAULT_BAR_BY_UNIT.kg);
          setCustom("");
        }
        if (active) setReady(true);
      })();
      return () => {
        active = false;
      };
    }, [initialWeight])
  );

  const presets = unit === "kg" ? KG_BARS : LB_BARS;
  const denoms = unit === "kg" ? KG_PLATES : LB_PLATES;
  const active = custom !== "" ? parseFloat(custom) : bar;

  const parsed = parseFloat(target);
  const valid = !isNaN(parsed) && parsed > 0;

  const state = useMemo(() => {
    if (!valid || active == null || isNaN(active)) return null;
    if (parsed <= active) return { error: parsed === active ? "empty" as const : "low" as const };
    const side = perSide(parsed, active);
    const result = solve(side, denoms);
    const grouped = summarize(result.plates);
    const achieved = active + result.plates.reduce((a, b) => a + b, 0) * 2;
    return { side, result, grouped, achieved, rounded: result.remainder > 0 };
  }, [valid, parsed, active, denoms]);

  const label = unit === "kg" ? "kilograms" : "pounds";

  const persistTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistBar = useCallback((nextValue: string) => {
    if (persistTimeout.current) clearTimeout(persistTimeout.current);
    persistTimeout.current = setTimeout(() => {
      void setAppSetting(getBarSettingKey(unit), nextValue);
    }, 300);
  }, [unit]);

  useEffect(() => () => {
    if (persistTimeout.current) clearTimeout(persistTimeout.current);
  }, []);

  const selectBar = useCallback((val: number) => {
    setBar(val);
    setCustom("");
    persistBar(String(val));
  }, [persistBar]);

  const handleBarInput = useCallback((v: string) => {
    const num = parseFloat(v);
    if (v === "" || isNaN(num)) {
      setCustom("");
      const fallbackBar = presets[presets.length - 1];
      setBar(fallbackBar);
      persistBar(String(fallbackBar));
    } else if ((presets as readonly number[]).includes(num)) {
      setCustom("");
      setBar(num);
      persistBar(String(num));
    } else {
      setCustom(v);
      setBar(null);
      persistBar(v);
    }
  }, [persistBar, presets]);

  const diagram = state && !("error" in state) ? state.result.plates : [];

  const barbell = useMemo(() => {
    if (!state || "error" in state) return "";
    if (state.grouped.length === 0) return "Empty barbell, total " + active + " " + unit;
    const desc = state.grouped.map(function(g) { return g.count + "\u00d7" + g.weight + unit; }).join(", ");
    return "Barbell loaded with " + desc + " on each side, total " + state.achieved + " " + unit;
  }, [state, active, unit]);

  const items = useMemo(() => {
    if (!state || "error" in state) return [];
    return state.grouped;
  }, [state]);

  const sortedPresets = useMemo(() => [...presets].sort((a, b) => a - b), [presets]);

  return {
    unit,
    target,
    setTarget,
    bar,
    custom,
    ready,
    presets: sortedPresets,
    active,
    parsed,
    valid,
    state,
    diagram,
    barbell,
    items,
    label,
    selectBar,
    handleBarInput,
  };
}
