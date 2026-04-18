/* eslint-disable max-lines-per-function, react-hooks/exhaustive-deps */
import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import { useToast } from "@/components/ui/bna-toast";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as LocalAuthentication from "expo-local-authentication";

import {
  getPhotos,
  getPhotoCount,
  insertPhoto,
  softDeletePhoto,
  restorePhoto,
  cleanupDeletedPhotos,
  cleanupOrphanFiles,
} from "../lib/db/photos";
import type { ProgressPhoto, PoseCategory } from "../lib/db/photos";
import { getAppSetting, setAppSetting } from "../lib/db";
import { processImage, today } from "../lib/photo-processing";
import { usePhotoPermissions } from "./usePhotoPermissions";

export const PAGE_SIZE = 20;

export const POSE_OPTIONS: { label: string; value: PoseCategory }[] = [
  { label: "Front", value: "front" },
  { label: "Back", value: "back" },
  { label: "Side L", value: "side_left" },
  { label: "Side R", value: "side_right" },
];

export function usePhotoActions({ router }: { router: ReturnType<typeof import("expo-router").useRouter> }) {
  const { requestCameraPermission, requestGalleryPermission } = usePhotoPermissions();
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [poseFilter, setPoseFilter] = useState<PoseCategory | undefined>();
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { success, error: showError } = useToast();
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
  const pendingThumbRef = useRef<string>("");

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
      showError("Failed to load photos");
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
        try {
          await cleanupDeletedPhotos();
          await cleanupOrphanFiles();
        } catch {
          // Non-critical
        }

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

  const processAndSave = async (uri: string) => {
    const result = await processImage(uri);
    setPendingUri(result.fullUri);
    setPendingWidth(result.width);
    setPendingHeight(result.height);
    setMetaDate(today());
    setMetaPose(null);
    setMetaNote("");
    setMetaModal(true);
    (pendingThumbRef as React.MutableRefObject<string>).current = result.thumbUri;
  };

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
      showError("Failed to process photo");
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
      showError("Failed to process photo");
    } finally {
      setSaving(false);
    }
  };

  const isValidDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));

  const handleSaveMeta = async () => {
    if (!pendingUri) return;
    if (!isValidDate(metaDate)) {
      showError("Please enter a valid date (YYYY-MM-DD)");
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
      success("Photo saved");
    } catch {
      showError("Failed to save photo");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (photo: ProgressPhoto) => {
    await softDeletePhoto(photo.id);
    undoRef.current = { id: photo.id };
    await load();
    success("Photo deleted", {
      action: { label: "Undo", onPress: handleUndo },
    });
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

  return {
    photos,
    total,
    loading,
    saving,
    poseFilter,
    setPoseFilter,
    compareMode,
    setCompareMode,
    selectedIds,
    setSelectedIds,
    privacyModal,
    metaModal,
    setMetaModal,
    pendingUri,
    setPendingUri,
    metaDate,
    setMetaDate,
    metaPose,
    setMetaPose,
    metaNote,
    setMetaNote,
    fabOpen,
    setFabOpen,
    load,
    loadMore,
    dismissPrivacy,
    handleTakePhoto,
    handlePickImage,
    handleSaveMeta,
    handleDelete,
    handleUndo,
    handlePhotoPress,
    handlePhotoLongPress,
    handleCompare,
  };
}
