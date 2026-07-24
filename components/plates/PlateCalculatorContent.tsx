import { useEffect } from "react";
import {
  FlatList,
  StyleSheet,
  View,
} from "react-native"
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { color } from "../../lib/plates"
import { useThemeColors } from "@/hooks/useThemeColors";
import { usePlateCalculator } from "../../hooks/usePlateCalculator";
import { Barbell } from "./BarbellDiagram";

type PlateState = {
  side: number;
  result: { plates: number[]; remainder: number };
  grouped: { weight: number; count: number }[];
  achieved: number;
  rounded: boolean;
};

type CalcState = PlateState | { error: "empty" | "low" } | null;

function StatusMessage({ valid, target, state, parsed, active, unit }: {
  valid: boolean; target: string; state: CalcState;
  parsed: number; active: number | null; unit: string;
}) {
  const colors = useThemeColors();

  if (!valid && target !== "") {
    return (
      <Text variant="caption" style={{ color: colors.error, textAlign: "center" }}>
        Enter a valid weight
      </Text>
    );
  }

  if (valid && state && "error" in state && state.error === "low") {
    return (
      <Text variant="caption" style={{ color: colors.error, textAlign: "center" }}>
        Weight must exceed bar weight
      </Text>
    );
  }

  if (valid && state && "error" in state && state.error === "empty") {
    return (
      <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "center" }}>
        Target equals bar weight — no plates needed
      </Text>
    );
  }

  if (state && !("error" in state)) {
    return (
      <>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "center" }}>
          ({parsed} − {active}) ÷ 2 = {state.side} {unit} per side
        </Text>
        {state.rounded && (
          <Text variant="caption" style={{ color: colors.tertiary, textAlign: "center", marginTop: 2 }}>
            Rounded to {state.achieved}{unit} (nearest achievable)
          </Text>
        )}
      </>
    );
  }

  return null;
}

export function PlateResults({ valid, target, state, parsed, active, unit, items }: {
  valid: boolean; target: string; state: CalcState;
  parsed: number; active: number | null; unit: string;
  items: { weight: number; count: number }[];
}) {
  const colors = useThemeColors();

  return (
    <>
      <View accessibilityLiveRegion="polite">
        <StatusMessage valid={valid} target={target} state={state} parsed={parsed} active={active} unit={unit} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.weight)}
        scrollEnabled={false}
        renderItem={({ item: g }) => {
          const c = color(g.weight, unit as "kg" | "lb")
          return (
            <View style={styles.row}>
              <View
                style={[
                  styles.swatch,
                  {
                    backgroundColor: c.bg,
                    borderColor: c.border ? colors[c.border] : "transparent",
                    borderWidth: c.border ? 1 : 0,
                  },
                ]}
              />
              <Text variant="body" style={{ color: colors.onBackground }}>
                {g.count}× {g.weight}{unit}
              </Text>
            </View>
          )
        }}
      />

      {state && !("error" in state) && (
        <Text variant="subtitle" style={{ color: colors.onBackground, textAlign: "center", marginTop: 16 }}>
          Total: {state.achieved}{unit}
          {active != null && (
            <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
              {" "}(bar {active}{unit} + 2×{state.side}{unit})
            </Text>
          )}
        </Text>
      )}
    </>
  );
}

export function PlateCalculatorContent({
  initialWeight,
  unit: propUnit,
  onBarChanged,
}: {
  initialWeight?: string;
  unit?: "kg" | "lb";
  onBarChanged?: (newBar: number) => void;
}) {
  const colors = useThemeColors()
  const {
    unit, target, setTarget,
    bar, custom, ready,
    presets, active, parsed, valid,
    state, diagram, barbell, items, label,
    selectBar, handleBarInput,
  } = usePlateCalculator(initialWeight, propUnit)

  useEffect(() => {
    if (active != null && !isNaN(active) && onBarChanged) {
      onBarChanged(active);
    }
  }, [active, onBarChanged]);

  if (!ready) return null

  return (
    <View>
      {/* [target] with [bar] */}
      <View style={styles.inputRow}>
        <View style={styles.targetWrap}>
          <Input
            variant="outline"
            keyboardType="numeric"
            value={target}
            onChangeText={setTarget}
            placeholder="Total"
            rightComponent={() => <Text variant="caption" style={{ marginRight: 8 }}>{unit}</Text>}
            accessibilityLabel={"Target weight in " + label}
          />
        </View>
        <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
          with bar
        </Text>
        <View style={styles.barWrap} accessibilityRole="radiogroup" accessibilityLabel="Bar weight selection">
          <View style={styles.barInputWrap}>
            <Input
              variant="outline"
              keyboardType="numeric"
              value={custom !== "" ? custom : bar != null ? String(bar) : ""}
              onChangeText={handleBarInput}
              placeholder="Bar"
              rightComponent={() => <Text variant="caption" style={{ marginRight: 8 }}>{unit}</Text>}
              accessibilityLabel={"Bar weight in " + label}
            />
          </View>
          {presets.map(p => (
            <Chip
              key={p}
              selected={custom === "" && bar === p}
              onPress={() => selectBar(p)}
              compact
              accessibilityRole="radio"
              accessibilityState={{ selected: custom === "" && bar === p }}
              accessibilityLabel={p + " " + label + " bar"}
            >{`${p}`}</Chip>
          ))}
        </View>
      </View>

      {/* Barbell always visible */}
      <Barbell plates={diagram} unit={unit} barbell={barbell || "Empty barbell"} />

      {/* Results, plate list, and footer */}
      <PlateResults
        valid={valid}
        target={target}
        state={state}
        parsed={parsed}
        active={active}
        unit={unit}
        items={items}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  targetWrap: {
    width: 130,
  },
  barWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  barInputWrap: {
    width: 124,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
})
