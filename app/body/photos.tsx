import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { FAB } from "@/components/ui/fab";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/bna-toast";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { File, Directory, Paths } from "expo-file-system";
import * as LocalAuthentication from "expo-local-authentication";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import PhotoGrid from "../../components/PhotoGrid";
import EmptyState from "../../components/EmptyState";
import {
  getPhotos,
  getPhotoCount,
  insertPhoto,
  softDeletePhoto,
  restorePhoto,
  cleanupDeletedPhotos,
  cleanupOrphanFiles,
  ensurePhotoDirs,
} from "../../lib/db/photos";
import type { ProgressPhoto, PoseCategory } from "../../lib/db/photos";
import { getAppSetting, setAppSetting } from "../../lib/db";
import { uuid } from "../../lib/uuid";
import { scrim } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

const PAGE_SIZE = 20;
const MAX_DIMENSION = 1200;
const THUMB_SIZE = 300;

const POSE_OPTIONS: { label: string; value: PoseCategory }[] = [
  { label: "Front", value: "front" },
  { label: "Back", value: "back" },
  { label: "Side L", value: "side_left" },
  { label: "Side R", value: "side_right" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PhotosScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [poseFilter, setPoseFilter] = useState<PoseCategory | undefined>();
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { toast } = useToast();
  const [privacyModal, setPrivacyModal] = useState(false);
  const [metaModal, setMetaModal] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [pendingWidth, setPendingWidth] = useState<number | null>(null);
  const [pendingHeight, setPendingHeight] = useState<number | null>(null);
  const [metaDate, setMetaDate] = useState(today());
  const [metaPose, setMetaPose] = useState<PoseCategory | null>(null);
  const [metaNote, setMetaNote] = useState("");
  const [fabOpen, setFabOpen] = useState(false);

  const undoRef = useRef<{ id: string } | null>(null);
  const authCheckedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [items, count] = await Promise.all([
        getPhotos(PAGE_SIZE, 0, poseFilter),
        getPhotoCount(poseFilter),
      ]);
      setPhotos(items);
      setTotal(count);
    } catch {
      toast("Failed to load photos");
    } finally {
      setLoading(false);
    }
  }, [poseFilter]);

  const loadMore = useCallback(async () => {
    if (photos.length >= total) return;
    const more = await getPhotos(PAGE_SIZE, photos.length, poseFilter);
    setPhotos((prev) => [...prev, ...more]);
  }, [photos.length, total, poseFilter]);

  useFocusEffect(
    useCallback(() => {
      const init = async () => {
        // Run cleanup on first focus
        try {
          await cleanupDeletedPhotos();
          await cleanupOrphanFiles();
        } catch {
          // Non-critical
        }

        // Check biometric lock
        if (!authCheckedRef.current) {
          const lockEnabled = await getAppSetting("photos_biometric_lock");
          if (lockEnabled === "true") {
            const result = await LocalAuthentication.authenticateAsync({
              promptMessage: "Authenticate to view progress photos",
              fallbackLabel: "Use passcode",
            });
            if (!result.success) {
              router.back();
              return;
            }
          }
          authCheckedRef.current = true;
        }

        // Check first-use privacy notice
        const noticed = await getAppSetting("photos_privacy_noticed");
        if (!noticed) {
          setPrivacyModal(true);
        }

        await load();
      };
      init();
    }, [load, router])
  );

  const dismissPrivacy = async () => {
    await setAppSetting("photos_privacy_noticed", "true");
    setPrivacyModal(false);
  };

  const requestCameraPermission = async (): Promise<boolean> => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Camera Permission Required",
        "Please enable camera access in your device settings to take progress photos.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open Settings",
            onPress: () => {
              Linking.openSettings();
            },
          },
        ]
      );
      return false;
    }
    return true;
  };

  const requestGalleryPermission = async (): Promise<boolean> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Gallery Permission Required",
        "Please enable photo library access in your device settings to import progress photos.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]
      );
      return false;
    }
    return true;
  };

  const processAndSave = async (uri: string) => {
    // Resize image
    const resized = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_DIMENSION } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );

    // Generate thumbnail
    const thumb = await ImageManipulator.manipulateAsync(
      resized.uri,
      [{ resize: { width: THUMB_SIZE } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );

    ensurePhotoDirs();

    const photoId = uuid();
    const fileName = `${photoId}.jpg`;
    const thumbName = `thumb_${photoId}.jpg`;
    const photoDir = new Directory(Paths.document, "progress-photos");
    const thumbDir = new Directory(Paths.document, "progress-photos", "thumbnails");
    const destFile = new File(photoDir, fileName);
    const thumbFile = new File(thumbDir, thumbName);

    const resizedFile = new File(resized.uri);
    resizedFile.move(destFile);
    const thumbSrcFile = new File(thumb.uri);
    thumbSrcFile.move(thumbFile);

    setPendingUri(destFile.uri);
    setPendingWidth(resized.width);
    setPendingHeight(resized.height);
    setMetaDate(today());
    setMetaPose(null);
    setMetaNote("");
    setMetaModal(true);

    // Store thumb path for later use
    (pendingThumbRef as React.MutableRefObject<string>).current = thumbFile.uri;
  };

  const pendingThumbRef = useRef<string>("");

  const handleTakePhoto = async () => {
    setFabOpen(false);
    const permitted = await requestCameraPermission();
    if (!permitted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.[0]) return;
    setSaving(true);
    try {
      await processAndSave(result.assets[0].uri);
    } catch {
      toast("Failed to process photo");
    } finally {
      setSaving(false);
    }
  };

  const handlePickImage = async () => {
    setFabOpen(false);
    const permitted = await requestGalleryPermission();
    if (!permitted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.[0]) return;
    setSaving(true);
    try {
      await processAndSave(result.assets[0].uri);
    } catch {
      toast("Failed to process photo");
    } finally {
      setSaving(false);
    }
  };

  const isValidDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));

  const handleSaveMeta = async () => {
    if (!pendingUri) return;
    if (!isValidDate(metaDate)) {
      toast("Please enter a valid date (YYYY-MM-DD)");
      return;
    }
    setSaving(true);
    try {
      await insertPhoto({
        filePath: pendingUri,
        thumbnailPath: pendingThumbRef.current || null,
        displayDate: metaDate,
        poseCategory: metaPose,
        note: metaNote || null,
        width: pendingWidth,
        height: pendingHeight,
      });
      setMetaModal(false);
      setPendingUri(null);
      await load();
      toast("Photo saved");
    } catch {
      toast("Failed to save photo");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (photo: ProgressPhoto) => {
    await softDeletePhoto(photo.id);
    undoRef.current = { id: photo.id };
    await load();
    toast("Photo deleted");
  };

  const handleUndo = async () => {
    if (!undoRef.current) return;
    await restorePhoto(undoRef.current.id);
    undoRef.current = null;
    await load();
  };

  const handlePhotoPress = (photo: ProgressPhoto) => {
    if (compareMode) {
      setSelectedIds((prev) => {
        if (prev.includes(photo.id)) {
          return prev.filter((id) => id !== photo.id);
        }
        if (prev.length >= 2) return prev;
        return [...prev, photo.id];
      });
      return;
    }
    // Full screen view — show image in a modal-like experience
    Alert.alert(
      photo.display_date,
      photo.note || undefined,
      [
        {
          text: "Delete",
          style: "destructive",
          onPress: () => handleDelete(photo),
        },
        { text: "Close", style: "cancel" },
      ]
    );
  };

  const handlePhotoLongPress = (photo: ProgressPhoto) => {
    if (compareMode) return;
    Alert.alert(
      "Photo Options",
      undefined,
      [
        {
          text: "Delete",
          style: "destructive",
          onPress: () => handleDelete(photo),
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const handleCompare = () => {
    if (selectedIds.length === 2) {
      router.push({
        pathname: "/body/compare",
        params: { id1: selectedIds[0], id2: selectedIds[1] },
      });
      setCompareMode(false);
      setSelectedIds([]);
    }
  };

  const filterHeader = (
    <View style={styles.filterRow}>
      <View style={styles.chips}>
        <Chip
          selected={!poseFilter}
          onPress={() => setPoseFilter(undefined)}
          style={styles.chip}
          accessibilityLabel="All poses filter"
          accessibilityRole="togglebutton"
        >
          All
        </Chip>
        {POSE_OPTIONS.map((p) => (
          <Chip
            key={p.value}
            selected={poseFilter === p.value}
            onPress={() => setPoseFilter(poseFilter === p.value ? undefined : p.value)}
            style={styles.chip}
            accessibilityLabel={`${p.label} pose filter`}
            accessibilityRole="togglebutton"
          >
            {p.label}
          </Chip>
        ))}
      </View>
      <TouchableOpacity
        onPress={() => {
          if (compareMode) {
            setCompareMode(false);
            setSelectedIds([]);
          } else {
            setCompareMode(true);
          }
        }}
        disabled={total < 2 && !compareMode}
        accessibilityLabel="Compare photos"
        accessibilityRole="button"
        accessibilityHint={total < 2 ? "Need at least 2 photos to compare" : "Select two photos to compare side by side"}
        hitSlop={8}
        style={{ padding: 8 }}
      >
        <MaterialCommunityIcons name="compare" size={24} color={colors.onSurface} />
      </TouchableOpacity>
    </View>
  );

  const compareModeHeader = compareMode ? (
    <View style={[styles.compareBanner, { backgroundColor: colors.primaryContainer }]}>
      <Text variant="body" style={{ color: colors.onPrimaryContainer, flex: 1 }}>
        Select 2 photos ({selectedIds.length}/2)
      </Text>
      <Button
        variant="ghost"
        onPress={() => {
          setCompareMode(false);
          setSelectedIds([]);
        }}
        label="Cancel"
      />
    </View>
  ) : null;

  // Empty state
  if (!loading && total === 0 && !poseFilter) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <EmptyState
          icon="camera-plus-outline"
          title="Track your transformation"
          subtitle="Take your first progress photo to start tracking your visual changes over time."
          action={{
            label: "Take First Photo",
            onPress: handleTakePhoto,
          }}
        />
        {renderPrivacyModal()}
      </SafeAreaView>
    );
  }

  function renderPrivacyModal() {
    return (
      <Modal
        visible={privacyModal}
        transparent
        animationType="fade"
        onRequestClose={dismissPrivacy}
        accessibilityViewIsModal
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <MaterialCommunityIcons
              name="shield-lock-outline"
              size={48}
              color={colors.primary}
              style={{ alignSelf: "center", marginBottom: 16 }}
            />
            <Text variant="title" style={{ color: colors.onSurface, textAlign: "center", marginBottom: 12 }}>
              Your Photos Are Private
            </Text>
            <Text variant="body" style={{ color: colors.onSurfaceVariant, textAlign: "center", marginBottom: 24 }}>
              Your progress photos are stored only on this device and never uploaded to any server.
              Photos are not visible in your device&apos;s photo gallery.
              If you reinstall the app, photos will be lost.
            </Text>
            <Button variant="default" onPress={dismissPrivacy} label="I Understand" />
          </View>
        </View>
      </Modal>
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
          <>
            {filterHeader}
            {compareModeHeader}
          </>
        }
      />
      {/* FAB group */}
      {!compareMode && (
        <FAB.Group
          open={fabOpen}
          visible
          icon={fabOpen ? "close" : "plus"}
          actions={[
            {
              icon: "camera",
              label: "Take Photo",
              onPress: handleTakePhoto,
              accessibilityLabel: "Take progress photo",
            },
            {
              icon: "image",
              label: "From Library",
              onPress: handlePickImage,
              accessibilityLabel: "Choose photo from library",
            },
          ]}
          onStateChange={({ open }) => setFabOpen(open)}
          fabStyle={{ backgroundColor: colors.primary }}
          color={colors.onPrimary}
          accessibilityLabel="Add progress photo"
        />
      )}
      {/* Compare button */}
      {compareMode && selectedIds.length === 2 && (
        <View style={styles.compareBar}>
          <Button
            variant="default"
            onPress={handleCompare}
            style={{ flex: 1 }}
            accessibilityLabel="Compare photos"
            accessibilityRole="button"
            label="Compare"
          />
        </View>
      )}
      {/* Meta modal */}
      <Modal
        visible={metaModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setMetaModal(false);
          setPendingUri(null);
        }}
        accessibilityViewIsModal
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text variant="title" style={{ color: colors.onSurface, marginBottom: 16 }}>
              Photo Details
            </Text>
            {pendingUri && (
              <Image
                source={{ uri: pendingUri }}
                style={styles.preview}
                resizeMode="contain"
              />
            )}
            <Input
              placeholder="Date (YYYY-MM-DD)"
              value={metaDate}
              onChangeText={setMetaDate}
              style={styles.input}
              accessibilityLabel="Date"
            />
            <Text variant="body" style={{ color: colors.onSurface, marginTop: 8, marginBottom: 4 }}>
              Pose Category
            </Text>
            <View style={styles.chips}>
              {POSE_OPTIONS.map((p) => (
                <Chip
                  key={p.value}
                  selected={metaPose === p.value}
                  onPress={() => setMetaPose(metaPose === p.value ? null : p.value)}
                  style={styles.chip}
                  accessibilityLabel={`${p.label} pose category`}
                  accessibilityRole="togglebutton"
                >
                  {p.label}
                </Chip>
              ))}
            </View>
            <Input
              placeholder="Note (optional)"
              value={metaNote}
              onChangeText={setMetaNote}
              style={styles.input}
              multiline
              accessibilityLabel="Note"
            />
            <View style={styles.modalButtons}>
              <Button
                variant="outline"
                onPress={() => {
                  setMetaModal(false);
                  setPendingUri(null);
                }}
                style={{ flex: 1, marginRight: 8 }}
                label="Cancel"
              />
              <Button
                variant="default"
                onPress={handleSaveMeta}
                loading={saving}
                disabled={saving}
                style={{ flex: 1 }}
                label="Save"
              />
            </View>
          </View>
        </View>
      </Modal>
      {renderPrivacyModal()}
      {/* Saving overlay */}
      {saving && !metaModal && (
        <View style={styles.savingOverlay}>
          <View style={[styles.savingBox, { backgroundColor: colors.surface }]}>
            <Text variant="body" style={{ color: colors.onSurface }}>
              Saving photo...
            </Text>
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    flex: 1,
    gap: 4,
  },
  chip: {
    marginBottom: 4,
  },
  compareBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  compareBar: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    maxHeight: "85%",
  },
  preview: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginBottom: 16,
  },
  input: {
    marginTop: 8,
  },
  modalButtons: {
    flexDirection: "row",
    marginTop: 16,
  },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: scrim.dark,
    justifyContent: "center",
    alignItems: "center",
  },
  savingBox: {
    borderRadius: 12,
    padding: 24,
    elevation: 4,
  },
});
