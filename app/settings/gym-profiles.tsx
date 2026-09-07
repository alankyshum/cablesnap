/* eslint-disable max-lines-per-function */
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@lingui/core";

type GymDraft = { name: string; notes: string; isDefault: boolean };
type StackDraft = { name: string; unit: "kg" | "lb" };
type CalibrationDraft = { marker: string; weight: string; bulk: string };

export default function GymProfilesScreen() {
  const colors = useThemeColors();
  const layout = useLayout();
  const toast = useToast();
  const { t } = useLingui();
  const queryClient = useQueryClient();
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
      toast.error(t({ id: "settings.gymProfiles.loadFailed", message: "Failed to load gym profiles" }));
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

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
      toast.error(t({ id: "settings.gymProfiles.nameRequired", message: "Gym name is required" }));
      return;
    }
    try {
      await createGymProfile({ name, notes: newGymNotes.trim(), is_default: newGymDefault });
      setNewGymName("");
      setNewGymNotes("");
      setNewGymDefault(false);
      setShowAddGym(false);
      toast.success(t({ id: "settings.gymProfiles.saved", message: "Gym saved" }));
      await load();
    } catch {
      toast.error(t({ id: "settings.gymProfiles.saveFailed", message: "Failed to save gym" }));
    }
  }, [load, newGymDefault, newGymName, newGymNotes, t, toast]);

  const handleSaveGym = useCallback(async (gymId: string) => {
    const draft = gymDrafts[gymId];
    if (!draft?.name.trim()) {
      toast.error(t({ id: "settings.gymProfiles.nameRequired", message: "Gym name is required" }));
      return;
    }
    try {
      await updateGymProfile(gymId, {
        name: draft.name.trim(),
        notes: draft.notes.trim(),
        is_default: draft.isDefault,
      });
      toast.success(t({ id: "settings.gymProfiles.updated", message: "Gym updated" }));
      await load();
    } catch {
      toast.error(t({ id: "settings.gymProfiles.updateFailed", message: "Failed to update gym" }));
    }
  }, [gymDrafts, load, t, toast]);

  const handleSetDefault = useCallback(async (gymId: string) => {
    try {
      await setDefaultGym(gymId);
      toast.success(t({ id: "settings.gymProfiles.defaultUpdated", message: "Default gym updated" }));
      await load();
    } catch {
      toast.error(t({ id: "settings.gymProfiles.defaultUpdateFailed", message: "Failed to update default gym" }));
    }
  }, [load, t, toast]);

  const confirmDeleteGym = useCallback((gym: GymProfile) => {
    Alert.alert(t({ id: "settings.gymProfiles.deleteGymTitle", message: "Delete Gym" }), t({ id: "settings.gymProfiles.deleteGymMessage", message: `Delete ${gym.name}? Existing logged sessions will keep their gym snapshot.` }), [
      { text: t({ id: "common.cancel", message: "Cancel" }), style: "cancel" },
      {
        text: t({ id: "common.delete", message: "Delete" }),
        style: "destructive",
        onPress: async () => {
          try {
            await softDeleteGymProfile(gym.id);
            toast.success(t({ id: "settings.gymProfiles.deleted", message: "Gym deleted" }));
            await load();
          } catch {
            toast.error(t({ id: "settings.gymProfiles.deleteFailed", message: "Failed to delete gym" }));
          }
        },
      },
    ]);
  }, [load, t, toast]);

  const handleCreateStack = useCallback(async (gymId: string) => {
    const draft = newStackDrafts[gymId] ?? { name: "", unit: "kg" as const };
    if (!draft.name.trim()) {
      toast.error(t({ id: "settings.gymProfiles.stackNameRequired", message: "Stack name is required" }));
      return;
    }
    try {
      await createCableStack({ gym_id: gymId, name: draft.name.trim(), unit: draft.unit });
      setNewStackDrafts((prev) => ({ ...prev, [gymId]: { name: "", unit: draft.unit } }));
      toast.success(t({ id: "settings.gymProfiles.stackSaved", message: "Stack saved" }));
      setExpandedGyms((prev) => ({ ...prev, [gymId]: true }));
      await load();
    } catch {
      toast.error(t({ id: "settings.gymProfiles.stackSaveFailed", message: "Failed to save stack" }));
    }
  }, [load, newStackDrafts, t, toast]);

  const handleSaveStack = useCallback(async (stackId: string) => {
    const draft = stackDrafts[stackId];
    if (!draft?.name.trim()) {
      toast.error(t({ id: "settings.gymProfiles.stackNameRequired", message: "Stack name is required" }));
      return;
    }
    try {
      await updateCableStack(stackId, { name: draft.name.trim(), unit: draft.unit });
      toast.success(t({ id: "settings.gymProfiles.stackUpdated", message: "Stack updated" }));
      await load();
    } catch {
      toast.error(t({ id: "settings.gymProfiles.stackUpdateFailed", message: "Failed to update stack" }));
    }
  }, [load, stackDrafts, t, toast]);

  const confirmDeleteStack = useCallback((stack: CableStack) => {
    Alert.alert(t({ id: "settings.gymProfiles.deleteStackTitle", message: "Delete Cable Stack" }), t({ id: "settings.gymProfiles.deleteStackMessage", message: `Delete ${stack.name}? Historical sets keep the snapshotted stack name.` }), [
      { text: t({ id: "common.cancel", message: "Cancel" }), style: "cancel" },
      {
        text: t({ id: "common.delete", message: "Delete" }),
        style: "destructive",
        onPress: async () => {
          try {
            await softDeleteCableStack(stack.id);
            toast.success(t({ id: "settings.gymProfiles.stackDeleted", message: "Stack deleted" }));
            await load();
          } catch {
            toast.error(t({ id: "settings.gymProfiles.stackDeleteFailed", message: "Failed to delete stack" }));
          }
        },
      },
    ]);
  }, [load, t, toast]);

  const handleSaveCalibration = useCallback(async (stackId: string) => {
    const draft = calibrationDrafts[stackId] ?? { marker: "", weight: "", bulk: "" };
    const marker = Number(draft.marker);
    const weight = Number(draft.weight);
    if (!Number.isInteger(marker) || marker <= 0) {
      toast.error(t({ id: "settings.gymProfiles.markerInvalid", message: "Marker must be a whole number greater than 0" }));
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      toast.error(t({ id: "settings.gymProfiles.weightInvalid", message: "Weight must be greater than 0" }));
      return;
    }
    try {
      await upsertCalibration(stackId, marker, weight);
      updateCalibrationDraft(stackId, { marker: "", weight: "" });
      toast.success(t({ id: "settings.gymProfiles.markerSaved", message: "Marker saved" }));
      queryClient.invalidateQueries({ queryKey: ["stack-calibrations"] });
      await load();
    } catch {
      toast.error(t({ id: "settings.gymProfiles.markerSaveFailed", message: "Failed to save marker" }));
    }
  }, [calibrationDrafts, load, queryClient, t, toast, updateCalibrationDraft]);

  const handleBulkPaste = useCallback(async (stackId: string) => {
    const draft = calibrationDrafts[stackId] ?? { marker: "", weight: "", bulk: "" };
    const result = parseCalibrationBulkPaste(draft.bulk);
    if (result.accepted.length > 0) {
      try {
        await Promise.all(result.accepted.map((row) => upsertCalibration(stackId, row.marker, row.trueWeight)));
        updateCalibrationDraft(stackId, { bulk: "" });
        queryClient.invalidateQueries({ queryKey: ["stack-calibrations"] });
        await load();
      } catch {
        toast.error(t({ id: "settings.gymProfiles.bulkSaveFailed", message: "Failed to save pasted markers" }));
        return;
      }
    }

    const message = buildBulkPasteToast(result);
    if (message) {
      if (result.accepted.length > 0) toast.success(message);
      else toast.info(message);
    }
  }, [calibrationDrafts, load, queryClient, t, toast, updateCalibrationDraft]);

  const handleDeleteCalibration = useCallback(async (stackId: string, marker: number) => {
    try {
      await deleteCalibration(stackId, marker);
      toast.success(t({ id: "settings.gymProfiles.markerDeleted", message: "Marker deleted" }));
      queryClient.invalidateQueries({ queryKey: ["stack-calibrations"] });
      await load();
    } catch {
      toast.error(t({ id: "settings.gymProfiles.markerDeleteFailed", message: "Failed to delete marker" }));
    }
  }, [load, queryClient, t, toast]);

  const listHeader = useMemo(() => (
    <View style={styles.headerBlock}>
      <Text variant="heading" style={{ color: colors.onSurface, marginBottom: 8 }}>
        {t({ id: "settings.gymProfiles.title", message: "Gym Profiles" })}
      </Text>
      <Text variant="body" style={{ color: colors.onSurfaceVariant, marginBottom: 16 }}>
        {t({ id: "settings.gymProfiles.intro", message: "Add gyms here if you train across multiple locations." })}
      </Text>
      {showAddGym ? (
        <Card style={styles.card}>
          <CardContent>
            <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 12 }}>
              {t({ id: "settings.gymProfiles.addGym", message: "Add Gym" })}
            </Text>
            <Input
              label={t({ id: "settings.gymProfiles.gymName", message: "Gym name" })}
              placeholder={t({ id: "settings.gymProfiles.gymPlaceholder", message: "Downtown Gym" })}
              value={newGymName}
              onChangeText={setNewGymName}
              variant="outline"
            />
            <View style={styles.spacer} />
            <Input
              label={t({ id: "settings.gymProfiles.notes", message: "Notes" })}
              placeholder={t({ id: "settings.gymProfiles.notesPlaceholder", message: "Optional notes" })}
              value={newGymNotes}
              onChangeText={setNewGymNotes}
              type="textarea"
              rows={3}
              variant="outline"
            />
            <View style={styles.switchRow}>
              <Text variant="body" style={{ color: colors.onSurface }}>{t({ id: "settings.gymProfiles.defaultGym", message: "Default gym" })}</Text>
              <Switch value={newGymDefault} onValueChange={setNewGymDefault} />
            </View>
            <View style={styles.buttonRow}>
              <Button variant="outline" onPress={() => setShowAddGym(false)}>{t({ id: "common.cancel", message: "Cancel" })}</Button>
              <Button onPress={handleCreateGym}>{t({ id: "settings.gymProfiles.saveGym", message: "Save Gym" })}</Button>
            </View>
          </CardContent>
        </Card>
      ) : null}
      {!loading && gyms.length === 0 ? (
        <Card style={styles.card}>
          <CardContent>
            <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
              {t({ id: "settings.gymProfiles.intro", message: "Add gyms here if you train across multiple locations." })}
            </Text>
          </CardContent>
        </Card>
      ) : null}
    </View>
  ), [colors.onSurface, colors.onSurfaceVariant, gyms.length, handleCreateGym, loading, newGymDefault, newGymName, newGymNotes, showAddGym, t]);

  return (
    <>
      <Stack.Screen options={{ title: t({ id: "settings.gymProfiles.title", message: "Gym Profiles" }) }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}> 
        <FlatList
          data={gyms}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingTop: 16, paddingBottom: 120 }}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={loading ? (
            <Card style={styles.card}>
              <CardContent>
                <Text variant="body" style={{ color: colors.onSurfaceVariant }}>{t({ id: "settings.gymProfiles.loading", message: "Loading gym profiles…" })}</Text>
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
              accessibilityLabel={i18n._({ id: "settings.gymProfiles.toggleGymA11y", message: `{name}, {expanded, select, true {collapse} false {expand}}`, values: { name: gym.name, expanded: isExpanded } })}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={styles.titleRow}>
                          <Text variant="subtitle" style={{ color: colors.onSurface }}>{gym.name}</Text>
                          {gym.is_default === 1 ? (
                            <View style={[styles.badge, { backgroundColor: colors.primaryContainer }]}> 
                              <Text style={{ color: colors.onPrimaryContainer, fontSize: fontSizes.xs, fontWeight: "600" }}>{t({ id: "settings.gymProfiles.default", message: "Default" })}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                           {t({ id: "settings.gymProfiles.editHint", message: "Swipe to delete • tap to edit" })}
                        </Text>
                      </View>
                      {isExpanded ? <ChevronDown size={18} color={colors.onSurfaceVariant} /> : <ChevronRight size={18} color={colors.onSurfaceVariant} />}
                    </Pressable>

                    {isExpanded ? (
                      <View style={styles.expandedSection}>
                        <Input label={t({ id: "settings.gymProfiles.gymName", message: "Gym name" })} value={gymDraft.name} onChangeText={(value) => updateGymDraft(gym.id, { name: value })} variant="outline" />
                        <View style={styles.spacer} />
                        <Input label={t({ id: "settings.gymProfiles.notes", message: "Notes" })} value={gymDraft.notes} onChangeText={(value) => updateGymDraft(gym.id, { notes: value })} type="textarea" rows={3} variant="outline" />
                        <View style={styles.switchRow}>
                          <Text variant="body" style={{ color: colors.onSurface }}>{t({ id: "settings.gymProfiles.defaultGym", message: "Default gym" })}</Text>
                          <Switch value={gymDraft.isDefault} onValueChange={(value) => updateGymDraft(gym.id, { isDefault: value })} />
                        </View>
                        <View style={styles.buttonRow}>
                          <Button variant="outline" onPress={() => handleSaveGym(gym.id)}>{t({ id: "settings.gymProfiles.saveGymChanges", message: "Save Gym Changes" })}</Button>
                          {gym.is_default !== 1 ? <Button variant="ghost" onPress={() => handleSetDefault(gym.id)}>{t({ id: "settings.gymProfiles.setDefault", message: "Set as default" })}</Button> : null}
                        </View>

                        <View style={styles.sectionHeader}>
                          <Text variant="subtitle" style={{ color: colors.onSurface }}>{t({ id: "settings.gymProfiles.cableStacks", message: "Cable Stacks" })}</Text>
                          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                            {t({ id: "settings.gymProfiles.markersHint", message: "Markers are specific to this gym." })}
                          </Text>
                        </View>

                        {stacks.length === 0 ? (
                          <Text variant="body" style={{ color: colors.onSurfaceVariant, marginBottom: 12 }}>
                            {t({ id: "settings.gymProfiles.noStacks", message: "No cable stacks yet." })}
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
                                   accessibilityLabel={i18n._({ id: "settings.gymProfiles.toggleStackA11y", message: `{name}, {expanded, select, true {collapse} false {expand}}`, values: { name: stack.name, expanded: stackExpanded } })}
                                >
                                  <View style={{ flex: 1 }}>
                                    <Text variant="body" style={{ color: colors.onSurface, fontWeight: "600" }}>{stack.name}</Text>
                                     <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{i18n._({ id: "settings.gymProfiles.markerCount", message: `{count, plural, one {# marker} other {# markers}}`, values: { count: calibrations.length } })}</Text>
                                  </View>
                                  {stackExpanded ? <ChevronDown size={18} color={colors.onSurfaceVariant} /> : <ChevronRight size={18} color={colors.onSurfaceVariant} />}
                                </Pressable>

                                {stackExpanded ? (
                                  <View style={styles.expandedSection}>
                                    <Input label={t({ id: "settings.gymProfiles.stackName", message: "Stack name" })} value={stackDraft.name} onChangeText={(value) => updateStackDraft(stack.id, { name: value })} variant="outline" />
                                    <View style={styles.spacer} />
                                    <SegmentedControl
                                      value={stackDraft.unit}
                                      onValueChange={(value) => updateStackDraft(stack.id, { unit: value as "kg" | "lb" })}
                                      buttons={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]}
                                    />
                                    <View style={styles.spacer} />
                                    <Button variant="outline" onPress={() => handleSaveStack(stack.id)}>{t({ id: "settings.gymProfiles.saveStack", message: "Save Stack" })}</Button>

                                    <View style={styles.sectionHeader}>
                                      <Text variant="body" style={{ color: colors.onSurface, fontWeight: "600" }}>{t({ id: "settings.gymProfiles.markerCalibrations", message: "Marker calibrations" })}</Text>
                                    </View>
                                    {calibrations.map((calibration) => (
                                      <View key={`${stack.id}-${calibration.marker}`} style={styles.calibrationRow}>
                                         <Text variant="body" style={{ color: colors.onSurface, flex: 1 }}>
                                           {t({ id: "settings.gymProfiles.markerValue", message: `Marker ${calibration.marker} — ${calibration.true_weight} ${stack.unit}` })}
                                        </Text>
                                        <Button variant="ghost" size="sm" onPress={() => handleDeleteCalibration(stack.id, calibration.marker)}>
                                           {t({ id: "common.delete", message: "Delete" })}
                                        </Button>
                                      </View>
                                    ))}
                                    <View style={styles.inlineInputs}>
                                      <View style={{ flex: 1 }}>
                                        <Input
                                          label={t({ id: "settings.gymProfiles.marker", message: "Marker" })}
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
                                     <Button variant="outline" onPress={() => handleSaveCalibration(stack.id)}>{t({ id: "settings.gymProfiles.saveMarker", message: "Save Marker" })}</Button>
                                    <View style={styles.spacer} />
                                    <Input
                                       label={t({ id: "settings.gymProfiles.bulkPaste", message: "Bulk paste" })}
                                       placeholder={t({ id: "settings.gymProfiles.bulkPlaceholder", message: "1=5\n2=7.5\n3=10" })}
                                      value={calibrationDraft.bulk}
                                      onChangeText={(value) => updateCalibrationDraft(stack.id, { bulk: value })}
                                      type="textarea"
                                      rows={4}
                                      variant="outline"
                                    />
                                    <View style={styles.spacer} />
                                     <Button variant="outline" onPress={() => handleBulkPaste(stack.id)}>{t({ id: "settings.gymProfiles.applyBulk", message: "Apply Bulk Paste" })}</Button>
                                  </View>
                                ) : null}
                              </View>
                            </SwipeToDelete>
                          );
                        })}

                        <View style={[styles.stackCard, { borderColor: colors.outlineVariant }]}> 
                          <Text variant="body" style={{ color: colors.onSurface, fontWeight: "600", marginBottom: 8 }}>
                             {t({ id: "settings.gymProfiles.addStack", message: "Add cable stack" })}
                          </Text>
                          <Input
                             label={t({ id: "settings.gymProfiles.stackName", message: "Stack name" })}
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
                           <Button variant="outline" onPress={() => handleCreateStack(gym.id)}>{t({ id: "settings.gymProfiles.addStackButton", message: "Add Stack" })}</Button>
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
    borderRadius: radii.pill,
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
    borderRadius: radii.pill,
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
