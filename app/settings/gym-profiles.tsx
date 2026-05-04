/* eslint-disable max-lines-per-function */
import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Switch, View } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { ChevronDown, ChevronRight, Plus } from "lucide-react-native";
import SwipeToDelete from "@/components/SwipeToDelete";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/bna-toast";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLayout } from "@/lib/layout";
import {
  createCableStack,
  createGymProfile,
  deleteCalibration,
  listCableStacks,
  listCalibrations,
  listGymProfiles,
  setDefaultGym,
  softDeleteCableStack,
  softDeleteGymProfile,
  updateCableStack,
  updateGymProfile,
  upsertCalibration,
  type CableStack,
  type GymProfile,
  type StackCalibration,
} from "@/lib/db";
import { buildBulkPasteToast, parseCalibrationBulkPaste } from "@/lib/cable-stack";

type GymDraft = { name: string; notes: string; isDefault: boolean };
type StackDraft = { name: string; unit: "kg" | "lb" };
type CalibrationDraft = { marker: string; weight: string; bulk: string };

export default function GymProfilesScreen() {
  const colors = useThemeColors();
  const layout = useLayout();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [gyms, setGyms] = useState<GymProfile[]>([]);
  const [stacksByGym, setStacksByGym] = useState<Record<string, CableStack[]>>({});
  const [calibrationsByStack, setCalibrationsByStack] = useState<Record<string, StackCalibration[]>>({});
  const [gymDrafts, setGymDrafts] = useState<Record<string, GymDraft>>({});
  const [stackDrafts, setStackDrafts] = useState<Record<string, StackDraft>>({});
  const [newStackDrafts, setNewStackDrafts] = useState<Record<string, StackDraft>>({});
  const [calibrationDrafts, setCalibrationDrafts] = useState<Record<string, CalibrationDraft>>({});
  const [expandedGyms, setExpandedGyms] = useState<Record<string, boolean>>({});
  const [expandedStacks, setExpandedStacks] = useState<Record<string, boolean>>({});
  const [showAddGym, setShowAddGym] = useState(false);
  const [newGymName, setNewGymName] = useState("");
  const [newGymNotes, setNewGymNotes] = useState("");
  const [newGymDefault, setNewGymDefault] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const nextGyms = await listGymProfiles();
      const stackEntries = await Promise.all(
        nextGyms.map(async (gym) => [gym.id, await listCableStacks(gym.id)] as const)
      );
      const nextStacksByGym = Object.fromEntries(stackEntries);
      const allStacks = stackEntries.flatMap(([, stacks]) => stacks);
      const calibrationEntries = await Promise.all(
        allStacks.map(async (stack) => [stack.id, await listCalibrations(stack.id)] as const)
      );

      setGyms(nextGyms);
      setStacksByGym(nextStacksByGym);
      setCalibrationsByStack(Object.fromEntries(calibrationEntries));
      setGymDrafts(
        Object.fromEntries(
          nextGyms.map((gym) => [gym.id, { name: gym.name, notes: gym.notes ?? "", isDefault: gym.is_default === 1 }])
        )
      );
      setStackDrafts(
        Object.fromEntries(
          allStacks.map((stack) => [stack.id, { name: stack.name, unit: stack.unit as "kg" | "lb" }])
        )
      );
      setNewStackDrafts((prev) => {
        const next = { ...prev };
        for (const gym of nextGyms) next[gym.id] ??= { name: "", unit: "kg" };
        return next;
      });
      setCalibrationDrafts((prev) => {
        const next = { ...prev };
        for (const stack of allStacks) next[stack.id] ??= { marker: "", weight: "", bulk: "" };
        return next;
      });
      setExpandedGyms((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        return Object.fromEntries(nextGyms.map((gym, index) => [gym.id, index === 0]));
      });
    } catch {
      toast.error("Failed to load gym profiles");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const updateGymDraft = useCallback((gymId: string, patch: Partial<GymDraft>) => {
    setGymDrafts((prev) => ({
      ...prev,
      [gymId]: { ...(prev[gymId] ?? { name: "", notes: "", isDefault: false }), ...patch },
    }));
  }, []);

  const updateStackDraft = useCallback((stackId: string, patch: Partial<StackDraft>) => {
    setStackDrafts((prev) => ({
      ...prev,
      [stackId]: { ...(prev[stackId] ?? { name: "", unit: "kg" }), ...patch },
    }));
  }, []);

  const updateNewStackDraft = useCallback((gymId: string, patch: Partial<StackDraft>) => {
    setNewStackDrafts((prev) => ({
      ...prev,
      [gymId]: { ...(prev[gymId] ?? { name: "", unit: "kg" }), ...patch },
    }));
  }, []);

  const updateCalibrationDraft = useCallback((stackId: string, patch: Partial<CalibrationDraft>) => {
    setCalibrationDrafts((prev) => ({
      ...prev,
      [stackId]: { ...(prev[stackId] ?? { marker: "", weight: "", bulk: "" }), ...patch },
    }));
  }, []);

  const toggleGym = useCallback((gymId: string) => {
    setExpandedGyms((prev) => ({ ...prev, [gymId]: !prev[gymId] }));
  }, []);

  const toggleStack = useCallback((stackId: string) => {
    setExpandedStacks((prev) => ({ ...prev, [stackId]: !prev[stackId] }));
  }, []);

  const handleCreateGym = useCallback(async () => {
    const name = newGymName.trim();
    if (!name) {
      toast.error("Gym name is required");
      return;
    }
    try {
      await createGymProfile({ name, notes: newGymNotes.trim(), is_default: newGymDefault });
      setNewGymName("");
      setNewGymNotes("");
      setNewGymDefault(false);
      setShowAddGym(false);
      toast.success("Gym saved");
      await load();
    } catch {
      toast.error("Failed to save gym");
    }
  }, [load, newGymDefault, newGymName, newGymNotes, toast]);

  const handleSaveGym = useCallback(async (gymId: string) => {
    const draft = gymDrafts[gymId];
    if (!draft?.name.trim()) {
      toast.error("Gym name is required");
      return;
    }
    try {
      await updateGymProfile(gymId, {
        name: draft.name.trim(),
        notes: draft.notes.trim(),
        is_default: draft.isDefault,
      });
      toast.success("Gym updated");
      await load();
    } catch {
      toast.error("Failed to update gym");
    }
  }, [gymDrafts, load, toast]);

  const handleSetDefault = useCallback(async (gymId: string) => {
    try {
      await setDefaultGym(gymId);
      toast.success("Default gym updated");
      await load();
    } catch {
      toast.error("Failed to update default gym");
    }
  }, [load, toast]);

  const confirmDeleteGym = useCallback((gym: GymProfile) => {
    Alert.alert("Delete Gym", `Delete ${gym.name}? Existing logged sessions will keep their gym snapshot.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await softDeleteGymProfile(gym.id);
            toast.success("Gym deleted");
            await load();
          } catch {
            toast.error("Failed to delete gym");
          }
        },
      },
    ]);
  }, [load, toast]);

  const handleCreateStack = useCallback(async (gymId: string) => {
    const draft = newStackDrafts[gymId] ?? { name: "", unit: "kg" as const };
    if (!draft.name.trim()) {
      toast.error("Stack name is required");
      return;
    }
    try {
      await createCableStack({ gym_id: gymId, name: draft.name.trim(), unit: draft.unit });
      setNewStackDrafts((prev) => ({ ...prev, [gymId]: { name: "", unit: draft.unit } }));
      toast.success("Stack saved");
      setExpandedGyms((prev) => ({ ...prev, [gymId]: true }));
      await load();
    } catch {
      toast.error("Failed to save stack");
    }
  }, [load, newStackDrafts, toast]);

  const handleSaveStack = useCallback(async (stackId: string) => {
    const draft = stackDrafts[stackId];
    if (!draft?.name.trim()) {
      toast.error("Stack name is required");
      return;
    }
    try {
      await updateCableStack(stackId, { name: draft.name.trim(), unit: draft.unit });
      toast.success("Stack updated");
      await load();
    } catch {
      toast.error("Failed to update stack");
    }
  }, [load, stackDrafts, toast]);

  const confirmDeleteStack = useCallback((stack: CableStack) => {
    Alert.alert("Delete Cable Stack", `Delete ${stack.name}? Historical sets keep the snapshotted stack name.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await softDeleteCableStack(stack.id);
            toast.success("Stack deleted");
            await load();
          } catch {
            toast.error("Failed to delete stack");
          }
        },
      },
    ]);
  }, [load, toast]);

  const handleSaveCalibration = useCallback(async (stackId: string) => {
    const draft = calibrationDrafts[stackId] ?? { marker: "", weight: "", bulk: "" };
    const marker = Number(draft.marker);
    const weight = Number(draft.weight);
    if (!Number.isInteger(marker) || marker <= 0) {
      toast.error("Marker must be a whole number greater than 0");
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      toast.error("Weight must be greater than 0");
      return;
    }
    try {
      await upsertCalibration(stackId, marker, weight);
      updateCalibrationDraft(stackId, { marker: "", weight: "" });
      toast.success("Marker saved");
      await load();
    } catch {
      toast.error("Failed to save marker");
    }
  }, [calibrationDrafts, load, toast, updateCalibrationDraft]);

  const handleBulkPaste = useCallback(async (stackId: string) => {
    const draft = calibrationDrafts[stackId] ?? { marker: "", weight: "", bulk: "" };
    const result = parseCalibrationBulkPaste(draft.bulk);
    if (result.accepted.length > 0) {
      try {
        await Promise.all(result.accepted.map((row) => upsertCalibration(stackId, row.marker, row.trueWeight)));
        updateCalibrationDraft(stackId, { bulk: "" });
        await load();
      } catch {
        toast.error("Failed to save pasted markers");
        return;
      }
    }

    const message = buildBulkPasteToast(result);
    if (message) {
      if (result.accepted.length > 0) toast.success(message);
      else toast.info(message);
    }
  }, [calibrationDrafts, load, toast, updateCalibrationDraft]);

  const handleDeleteCalibration = useCallback(async (stackId: string, marker: number) => {
    try {
      await deleteCalibration(stackId, marker);
      toast.success("Marker deleted");
      await load();
    } catch {
      toast.error("Failed to delete marker");
    }
  }, [load, toast]);

  const listHeader = useMemo(() => (
    <View style={styles.headerBlock}>
      <Text variant="heading" style={{ color: colors.onSurface, marginBottom: 8 }}>
        Gym Profiles
      </Text>
      <Text variant="body" style={{ color: colors.onSurfaceVariant, marginBottom: 16 }}>
        Add gyms here if you train across multiple locations.
      </Text>
      {showAddGym ? (
        <Card style={styles.card}>
          <CardContent>
            <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 12 }}>
              Add Gym
            </Text>
            <Input
              label="Gym name"
              placeholder="Downtown Gym"
              value={newGymName}
              onChangeText={setNewGymName}
              variant="outline"
            />
            <View style={styles.spacer} />
            <Input
              label="Notes"
              placeholder="Optional notes"
              value={newGymNotes}
              onChangeText={setNewGymNotes}
              type="textarea"
              rows={3}
              variant="outline"
            />
            <View style={styles.switchRow}>
              <Text variant="body" style={{ color: colors.onSurface }}>Default gym</Text>
              <Switch value={newGymDefault} onValueChange={setNewGymDefault} />
            </View>
            <View style={styles.buttonRow}>
              <Button variant="outline" onPress={() => setShowAddGym(false)}>Cancel</Button>
              <Button onPress={handleCreateGym}>Save Gym</Button>
            </View>
          </CardContent>
        </Card>
      ) : null}
      {!loading && gyms.length === 0 ? (
        <Card style={styles.card}>
          <CardContent>
            <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
              Add gyms here if you train across multiple locations.
            </Text>
          </CardContent>
        </Card>
      ) : null}
    </View>
  ), [colors.onSurface, colors.onSurfaceVariant, gyms.length, handleCreateGym, loading, newGymDefault, newGymName, newGymNotes, showAddGym]);

  return (
    <>
      <Stack.Screen options={{ title: "Gym Profiles" }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}> 
        <FlatList
          data={gyms}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingTop: 16, paddingBottom: 120 }}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={loading ? (
            <Card style={styles.card}>
              <CardContent>
                <Text variant="body" style={{ color: colors.onSurfaceVariant }}>Loading gym profiles…</Text>
              </CardContent>
            </Card>
          ) : null}
          renderItem={({ item: gym }) => {
            const gymDraft = gymDrafts[gym.id] ?? { name: gym.name, notes: gym.notes ?? "", isDefault: gym.is_default === 1 };
            const stacks = stacksByGym[gym.id] ?? [];
            const isExpanded = !!expandedGyms[gym.id];
            return (
              <SwipeToDelete onDelete={() => confirmDeleteGym(gym)} widthBasis="container">
                <Card style={styles.card}>
                  <CardContent>
                    <Pressable
                      onPress={() => toggleGym(gym.id)}
                      style={styles.rowHeader}
                      accessibilityRole="button"
                      accessibilityLabel={`${gym.name}, ${isExpanded ? "collapse" : "expand"}`}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={styles.titleRow}>
                          <Text variant="subtitle" style={{ color: colors.onSurface }}>{gym.name}</Text>
                          {gym.is_default === 1 ? (
                            <View style={[styles.badge, { backgroundColor: colors.primaryContainer }]}> 
                              <Text style={{ color: colors.onPrimaryContainer, fontSize: fontSizes.xs, fontWeight: "600" }}>Default</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                          Swipe to delete • tap to edit
                        </Text>
                      </View>
                      {isExpanded ? <ChevronDown size={18} color={colors.onSurfaceVariant} /> : <ChevronRight size={18} color={colors.onSurfaceVariant} />}
                    </Pressable>

                    {isExpanded ? (
                      <View style={styles.expandedSection}>
                        <Input label="Gym name" value={gymDraft.name} onChangeText={(value) => updateGymDraft(gym.id, { name: value })} variant="outline" />
                        <View style={styles.spacer} />
                        <Input label="Notes" value={gymDraft.notes} onChangeText={(value) => updateGymDraft(gym.id, { notes: value })} type="textarea" rows={3} variant="outline" />
                        <View style={styles.switchRow}>
                          <Text variant="body" style={{ color: colors.onSurface }}>Default gym</Text>
                          <Switch value={gymDraft.isDefault} onValueChange={(value) => updateGymDraft(gym.id, { isDefault: value })} />
                        </View>
                        <View style={styles.buttonRow}>
                          <Button variant="outline" onPress={() => handleSaveGym(gym.id)}>Save Gym Changes</Button>
                          {gym.is_default !== 1 ? <Button variant="ghost" onPress={() => handleSetDefault(gym.id)}>Set as default</Button> : null}
                        </View>

                        <View style={styles.sectionHeader}>
                          <Text variant="subtitle" style={{ color: colors.onSurface }}>Cable Stacks</Text>
                          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                            Markers are specific to this gym.
                          </Text>
                        </View>

                        {stacks.length === 0 ? (
                          <Text variant="body" style={{ color: colors.onSurfaceVariant, marginBottom: 12 }}>
                            No cable stacks yet.
                          </Text>
                        ) : null}

                        {stacks.map((stack) => {
                          const stackDraft = stackDrafts[stack.id] ?? { name: stack.name, unit: stack.unit as "kg" | "lb" };
                          const calibrationDraft = calibrationDrafts[stack.id] ?? { marker: "", weight: "", bulk: "" };
                          const calibrations = (calibrationsByStack[stack.id] ?? []).slice().sort((a, b) => a.marker - b.marker);
                          const stackExpanded = !!expandedStacks[stack.id];
                          return (
                            <SwipeToDelete key={stack.id} onDelete={() => confirmDeleteStack(stack)} widthBasis="container">
                              <View style={[styles.stackCard, { borderColor: colors.outlineVariant }]}> 
                                <Pressable
                                  onPress={() => toggleStack(stack.id)}
                                  style={styles.rowHeader}
                                  accessibilityRole="button"
                                  accessibilityLabel={`${stack.name}, ${stackExpanded ? "collapse" : "expand"}`}
                                >
                                  <View style={{ flex: 1 }}>
                                    <Text variant="body" style={{ color: colors.onSurface, fontWeight: "600" }}>{stack.name}</Text>
                                    <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{calibrations.length} marker{calibrations.length === 1 ? "" : "s"}</Text>
                                  </View>
                                  {stackExpanded ? <ChevronDown size={18} color={colors.onSurfaceVariant} /> : <ChevronRight size={18} color={colors.onSurfaceVariant} />}
                                </Pressable>

                                {stackExpanded ? (
                                  <View style={styles.expandedSection}>
                                    <Input label="Stack name" value={stackDraft.name} onChangeText={(value) => updateStackDraft(stack.id, { name: value })} variant="outline" />
                                    <View style={styles.spacer} />
                                    <SegmentedControl
                                      value={stackDraft.unit}
                                      onValueChange={(value) => updateStackDraft(stack.id, { unit: value as "kg" | "lb" })}
                                      buttons={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]}
                                    />
                                    <View style={styles.spacer} />
                                    <Button variant="outline" onPress={() => handleSaveStack(stack.id)}>Save Stack</Button>

                                    <View style={styles.sectionHeader}>
                                      <Text variant="body" style={{ color: colors.onSurface, fontWeight: "600" }}>Marker calibrations</Text>
                                    </View>
                                    {calibrations.map((calibration) => (
                                      <View key={`${stack.id}-${calibration.marker}`} style={styles.calibrationRow}>
                                        <Text variant="body" style={{ color: colors.onSurface, flex: 1 }}>
                                          Marker {calibration.marker} — {calibration.true_weight} {stack.unit}
                                        </Text>
                                        <Button variant="ghost" size="sm" onPress={() => handleDeleteCalibration(stack.id, calibration.marker)}>
                                          Delete
                                        </Button>
                                      </View>
                                    ))}
                                    <View style={styles.inlineInputs}>
                                      <View style={{ flex: 1 }}>
                                        <Input
                                          label="Marker"
                                          value={calibrationDraft.marker}
                                          onChangeText={(value) => updateCalibrationDraft(stack.id, { marker: value })}
                                          keyboardType="numeric"
                                          variant="outline"
                                        />
                                      </View>
                                      <View style={{ flex: 1 }}>
                                        <Input
                                          label={`Weight (${stack.unit})`}
                                          value={calibrationDraft.weight}
                                          onChangeText={(value) => updateCalibrationDraft(stack.id, { weight: value })}
                                          keyboardType="decimal-pad"
                                          variant="outline"
                                        />
                                      </View>
                                    </View>
                                    <Button variant="outline" onPress={() => handleSaveCalibration(stack.id)}>Save Marker</Button>
                                    <View style={styles.spacer} />
                                    <Input
                                      label="Bulk paste"
                                      placeholder="1=5\n2=7.5\n3=10"
                                      value={calibrationDraft.bulk}
                                      onChangeText={(value) => updateCalibrationDraft(stack.id, { bulk: value })}
                                      type="textarea"
                                      rows={4}
                                      variant="outline"
                                    />
                                    <View style={styles.spacer} />
                                    <Button variant="outline" onPress={() => handleBulkPaste(stack.id)}>Apply Bulk Paste</Button>
                                  </View>
                                ) : null}
                              </View>
                            </SwipeToDelete>
                          );
                        })}

                        <View style={[styles.stackCard, { borderColor: colors.outlineVariant }]}> 
                          <Text variant="body" style={{ color: colors.onSurface, fontWeight: "600", marginBottom: 8 }}>
                            Add cable stack
                          </Text>
                          <Input
                            label="Stack name"
                            value={(newStackDrafts[gym.id] ?? { name: "", unit: "kg" }).name}
                            onChangeText={(value) => updateNewStackDraft(gym.id, { name: value })}
                            variant="outline"
                          />
                          <View style={styles.spacer} />
                          <SegmentedControl
                            value={(newStackDrafts[gym.id] ?? { name: "", unit: "kg" }).unit}
                            onValueChange={(value) => updateNewStackDraft(gym.id, { unit: value as "kg" | "lb" })}
                            buttons={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]}
                          />
                          <View style={styles.spacer} />
                          <Button variant="outline" onPress={() => handleCreateStack(gym.id)}>Add Stack</Button>
                        </View>
                      </View>
                    ) : null}
                  </CardContent>
                </Card>
              </SwipeToDelete>
            );
          }}
        />

        <Pressable
          onPress={() => setShowAddGym((prev) => !prev)}
          style={[styles.fab, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel={showAddGym ? "Hide add gym form" : "Add gym"}
        >
          <Plus size={22} color={colors.onPrimary} />
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBlock: { marginBottom: spacing.md },
  card: { marginBottom: spacing.md },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  expandedSection: { marginTop: 12 },
  sectionHeader: { marginTop: 18, marginBottom: 10 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 12,
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  stackCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  calibrationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  inlineInputs: {
    flexDirection: "row",
    gap: 12,
    marginVertical: 12,
  },
  spacer: { height: 12 },
});
