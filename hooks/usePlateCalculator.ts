import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getBodySettings } from "../lib/db";
import {
  solve,
  perSide,
  summarize,
  KG_PLATES,
  LB_PLATES,
  KG_BARS,
  LB_BARS,
} from "../lib/plates";

export function usePlateCalculator(initialWeight?: string) {
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [target, setTarget] = useState(initialWeight ?? "");
  const [bar, setBar] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [ready, setReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const body = await getBodySettings();
          setUnit(body.weight_unit);
          setBar(body.weight_unit === "kg" ? 20 : 45);
          if (initialWeight) setTarget(initialWeight);
        } catch {
          // Fall back to defaults if settings unavailable
          setBar(20);
        }
        setReady(true);
      })();
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

  function selectBar(val: number) {
    setBar(val);
    setCustom("");
  }

  const handleBarInput = useCallback((v: string) => {
    const num = parseFloat(v);
    if (v === "" || isNaN(num)) {
      setCustom("");
      setBar(presets[presets.length - 1]);
    } else if ((presets as readonly number[]).includes(num)) {
      setCustom("");
      setBar(num);
    } else {
      setCustom(v);
      setBar(null);
    }
  }, [presets]);

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
