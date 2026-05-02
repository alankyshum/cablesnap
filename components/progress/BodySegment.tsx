import { useCallback } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { FAB } from "@/components/ui/fab";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect } from "expo-router";
import type { BodyWeight } from "../../lib/types";
import { toDisplay } from "../../lib/units";
import { radii } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useBodyMetrics } from "@/hooks/useBodyMetrics";
import { useFloatingTabBarHeight } from "@/components/FloatingTabBar";
import WeightLogModal from "./WeightLogModal";
import {
  WeightCard,
  GoalsCard,
  ChartCard,
  SingleEntryCard,
  MeasurementsCard,
  ProgressPhotosCard,
} from "./BodyCards";

function BodyEntryRow({
  item,
  unit,
  onDelete,
}: {
  item: BodyWeight;
  unit: "kg" | "lb";
  onDelete: (item: BodyWeight) => void;
}) {
  const colors = useThemeColors();

  return (
    <View
      style={[styles.entryRow, { borderBottomColor: colors.outlineVariant }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.onSurface }}>
          {toDisplay(item.weight, unit)} {unit}
        </Text>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
          {item.date}
          {item.notes ? ` · ${item.notes}` : ""}
        </Text>
      </View>
      <Pressable
        onPress={() => onDelete(item)}
        accessibilityLabel={`Delete weight entry for ${item.date}`}
        hitSlop={8}
        style={{ padding: 8 }}
      >
        <MaterialCommunityIcons
          name="delete-outline"
          size={20}
          color={colors.onSurfaceVariant}
        />
      </Pressable>
    </View>
  );
}

function BodyModal({
  modal,
  setModal,
  unit,
  logWeight,
  setLogWeight,
  logDate,
  setLogDate,
  logNotes,
  setLogNotes,
  saving,
  handleSave,
}: {
  modal: boolean;
  setModal: (v: boolean) => void;
  unit: "kg" | "lb";
  logWeight: string;
  setLogWeight: (v: string) => void;
  logDate: string;
  setLogDate: (v: string) => void;
  logNotes: string;
  setLogNotes: (v: string) => void;
  saving: boolean;
  handleSave: () => void;
}) {
  return (
    <WeightLogModal
      visible={modal}
      onClose={() => setModal(false)}
      unit={unit}
      logWeight={logWeight}
      setLogWeight={setLogWeight}
      logDate={logDate}
      setLogDate={setLogDate}
      logNotes={logNotes}
      setLogNotes={setLogNotes}
      saving={saving}
      onSave={handleSave}
    />
  );
}

export default function BodySegment() {
  const colors = useThemeColors();
  const tabBarHeight = useFloatingTabBarHeight();

  const {
    settings,
    latest,
    previous,
    entries,
    total,
    chart,
    measurements,
    modal,
    setModal,
    logWeight,
    setLogWeight,
    logDate,
    setLogDate,
    logNotes,
    setLogNotes,
    saving,
    unit,
    loadBody,
    handleSave,
    handleDelete,
    loadMore,
    toggleUnit,
  } = useBodyMetrics();

  useFocusEffect(
    useCallback(() => {
      loadBody();
    }, [loadBody]),
  );

  if (!settings) return null;

  if (total === 0 && !measurements) {
    return (
      <View style={[styles.center, { flex: 1 }]}>
        <Text
          variant="heading"
          style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}
        >
          📏
        </Text>
        <Text
          style={{
            color: colors.onSurfaceVariant,
            textAlign: "center",
            padding: 16,
          }}
        >
          Log your first weigh-in
        </Text>
        <FAB
          icon="plus"
          onPress={() => setModal(true)}
          style={[styles.emptyFab, { backgroundColor: colors.primary }]}
          color={colors.onPrimary}
          accessibilityLabel="Log body weight"
        />
        <BodyModal
          modal={modal} setModal={setModal} unit={unit}
          logWeight={logWeight} setLogWeight={setLogWeight}
          logDate={logDate} setLogDate={setLogDate}
          logNotes={logNotes} setLogNotes={setLogNotes}
          saving={saving} handleSave={handleSave}
        />
      </View>
    );
  }

  const delta =
    latest && previous
      ? Math.round((latest.weight - previous.weight) * 10) / 10
      : null;

  const deltaDisplay =
    delta !== null ? toDisplay(Math.abs(delta), unit) : null;
  const arrow =
    delta !== null ? (delta > 0 ? "↑" : delta < 0 ? "↓" : "") : "";
  const deltaLabel =
    deltaDisplay !== null ? `${arrow}${deltaDisplay} ${unit}` : "";

  const renderEntry = ({ item }: { item: BodyWeight }) => (
    <BodyEntryRow item={item} unit={unit} onDelete={handleDelete} />
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={renderEntry}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
        ListHeaderComponent={
          <>
            {latest && (
              <WeightCard
                latest={latest}
                delta={delta}
                deltaLabel={deltaLabel}
                unit={unit}
                onToggleUnit={toggleUnit}
              />
            )}
            <GoalsCard
              settings={settings}
              latest={latest}
              measurements={measurements}
              unit={unit}
            />
            {chart.length >= 2 && <ChartCard chart={chart} unit={unit} />}
            {chart.length === 1 && latest && (
              <SingleEntryCard latest={latest} unit={unit} />
            )}
            <MeasurementsCard measurements={measurements} />
            <ProgressPhotosCard />
            <Text
              variant="subtitle"
              style={{
                color: colors.onSurface,
                marginBottom: 8,
                marginTop: 8,
              }}
            >
              Recent Entries
            </Text>
          </>
        }
        ListEmptyComponent={
          <Text style={{ color: colors.onSurfaceVariant }}>
            No entries yet
          </Text>
        }
      />
      <FAB
        icon="plus"
        onPress={() => setModal(true)}
        style={[styles.fab, { backgroundColor: colors.primary, bottom: tabBarHeight + 16 }]}
        color={colors.onPrimary}
        accessibilityLabel="Log body weight"
      />
      <BodyModal
        modal={modal} setModal={setModal} unit={unit}
        logWeight={logWeight} setLogWeight={setLogWeight}
        logDate={logDate} setLogDate={setLogDate}
        logNotes={logNotes} setLogNotes={setLogNotes}
        saving={saving} handleSave={handleSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyFab: {
    marginTop: 16,
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
