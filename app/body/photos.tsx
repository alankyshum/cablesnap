import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { FAB } from "@/components/ui/fab";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import PhotoGrid from "../../components/PhotoGrid";
import EmptyState from "../../components/EmptyState";
import PhotoFilterHeader from "../../components/photos/PhotoFilterHeader";
import PhotoMetaModal from "../../components/photos/PhotoMetaModal";
import PrivacyModal from "../../components/photos/PrivacyModal";
import { usePhotoActions, POSE_OPTIONS } from "@/hooks/usePhotoActions";
import { scrim } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function PhotosScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const {
    photos, total, loading, saving,
    poseFilter, setPoseFilter,
    compareMode, setCompareMode,
    selectedIds, setSelectedIds,
    privacyModal, metaModal, setMetaModal,
    pendingUri, setPendingUri,
    metaDate, setMetaDate,
    metaPose, setMetaPose,
    metaNote, setMetaNote,
    fabOpen, setFabOpen,
    loadMore, dismissPrivacy,
    handleTakePhoto, handlePickImage, handleSaveMeta,
    handlePhotoPress, handlePhotoLongPress, handleCompare,
  } = usePhotoActions({ router });

  if (!loading && total === 0 && !poseFilter) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <EmptyState
          icon="camera-plus-outline"
          title="Track your transformation"
          subtitle="Take your first progress photo to start tracking your visual changes over time."
          action={{ label: "Take First Photo", onPress: handleTakePhoto }}
        />
        <PrivacyModal visible={privacyModal} onDismiss={dismissPrivacy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <PhotoGrid
        photos={photos}
        onPhotoPress={handlePhotoPress}
        onPhotoLongPress={handlePhotoLongPress}
        onEndReached={loadMore}
        compareMode={compareMode}
        selectedIds={selectedIds}
        ListHeaderComponent={
          <PhotoFilterHeader
            poseFilter={poseFilter}
            compareMode={compareMode}
            selectedIds={selectedIds}
            total={total}
            onPoseChange={setPoseFilter}
            onToggleCompare={() => {
              if (compareMode) { setCompareMode(false); setSelectedIds([]); }
              else { setCompareMode(true); }
            }}
            onCancelCompare={() => { setCompareMode(false); setSelectedIds([]); }}
            poseOptions={POSE_OPTIONS}
          />
        }
      />
      {!compareMode && (
        <FAB.Group
          open={fabOpen}
          visible
          icon={fabOpen ? "close" : "plus"}
          actions={[
            { icon: "camera", label: "Take Photo", onPress: handleTakePhoto, accessibilityLabel: "Take progress photo" },
            { icon: "image", label: "From Library", onPress: handlePickImage, accessibilityLabel: "Choose photo from library" },
          ]}
          onStateChange={({ open }) => setFabOpen(open)}
          fabStyle={{ backgroundColor: colors.primary }}
          color={colors.onPrimary}
          accessibilityLabel="Add progress photo"
        />
      )}
      {compareMode && selectedIds.length === 2 && (
        <View style={styles.compareBar}>
          <Button variant="default" onPress={handleCompare} style={{ flex: 1 }} accessibilityLabel="Compare photos" accessibilityRole="button" label="Compare" />
        </View>
      )}
      <PhotoMetaModal
        visible={metaModal}
        pendingUri={pendingUri}
        metaDate={metaDate}
        metaPose={metaPose}
        metaNote={metaNote}
        saving={saving}
        onDateChange={setMetaDate}
        onPoseChange={setMetaPose}
        onNoteChange={setMetaNote}
        onSave={handleSaveMeta}
        onCancel={() => { setMetaModal(false); setPendingUri(null); }}
        poseOptions={POSE_OPTIONS}
      />
      <PrivacyModal visible={privacyModal} onDismiss={dismissPrivacy} />
      {saving && !metaModal && (
        <View style={styles.savingOverlay}>
          <View style={[styles.savingBox, { backgroundColor: colors.surface }]}>
            <Text variant="body" style={{ color: colors.onSurface }}>Saving photo...</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  compareBar: { position: "absolute", bottom: 16, left: 16, right: 16 },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: scrim.dark,
    justifyContent: "center",
    alignItems: "center",
  },
  savingBox: { borderRadius: 12, padding: 24, elevation: 4 },
});
