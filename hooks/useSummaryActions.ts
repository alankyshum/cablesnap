import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { captureRef } from "react-native-view-shot";
import { useToast } from "@/components/ui/bna-toast";
import { createTemplateFromSession, updateSession } from "@/lib/db";
import { stravaLog } from "../lib/strava-telemetry";

export function useSummaryActions(id: string | undefined) {
  const { toast } = useToast();
  const [rating, setRating] = useState<number | null>(null);
  const [notesText, setNotesText] = useState("");
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [stravaPreviewVisible, setStravaPreviewVisible] = useState(false);
  const [stravaImageLoading, setStravaImageLoading] = useState(false);
  const [achievementPreviewVisible, setAchievementPreviewVisible] = useState(false);
  const [achievementImageLoading, setAchievementImageLoading] = useState(false);
  const shareSheetRef = useRef<BottomSheetModal>(null);
  const shareCardRef = useRef<View>(null);
  const stravaCardRef = useRef<View>(null);
  const achievementCardRef = useRef<View>(null);

  const handleShareImage = useCallback(() => {
    setImageLoading(true);
    setPreviewVisible(true);
  }, []);

  const handleCaptureAndShare = useCallback(async () => {
    if (!shareCardRef.current) return;
    let uri: string | null = null;
    try {
      setImageLoading(true);
      uri = await captureRef(shareCardRef, { format: "png", quality: 1.0 });
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch {
      toast({ description: "Unable to generate image" });
    } finally {
      setImageLoading(false);
      setPreviewVisible(false);
      if (uri) {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    }
  }, [toast]);

  const handleStravaImage = useCallback((hasPrs: boolean, exerciseCount: number) => {
    setStravaImageLoading(false);
    setStravaPreviewVisible(true);
    stravaLog("info", "strava_share_image_tapped", {
      sessionId: id,
      hasPrs,
      exerciseCount,
    });
  }, [id]);

  const handleCaptureStravaAndShare = useCallback(async () => {
    if (!stravaCardRef.current) return;
    let uri: string | null = null;
    try {
      setStravaImageLoading(true);
      uri = await captureRef(stravaCardRef, { format: "png", quality: 1.0 });
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
      stravaLog("info", "strava_share_image_shared", { sessionId: id });
    } catch {
      toast({ description: "Unable to generate image" });
    } finally {
      setStravaImageLoading(false);
      setStravaPreviewVisible(false);
      if (uri) {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    }
  }, [id, toast]);

  const handleAchievementImage = useCallback((achievementCount: number) => {
    setAchievementImageLoading(false);
    setAchievementPreviewVisible(true);
    stravaLog("info", "achievement_recap_tapped", {
      sessionId: id,
      achievementCount,
    });
  }, [id]);

  const handleCaptureAchievementAndShare = useCallback(async (achievementCount: number) => {
    if (!achievementCardRef.current) return;
    let uri: string | null = null;
    try {
      setAchievementImageLoading(true);
      uri = await captureRef(achievementCardRef, { format: "png", quality: 1.0 });
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
      stravaLog("info", "achievement_recap_shared", { sessionId: id, achievementCount });
    } catch {
      toast({ description: "Unable to generate image" });
    } finally {
      setAchievementImageLoading(false);
      setAchievementPreviewVisible(false);
      if (uri) {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    }
  }, [id, toast]);

  const handleShareButtonPress = useCallback(() => {
    shareSheetRef.current?.present();
  }, []);

  const handleRatingChange = useCallback(async (newRating: number | null) => {
    if (!id) return;
    const previousRating = rating;
    setRating(newRating);
    try {
      await updateSession(id, { rating: newRating });
    } catch {
      setRating(previousRating);
      toast({ description: "Failed to save rating" });
    }
  }, [id, rating, toast]);

  const handleNotesSave = useCallback(async () => {
    if (!id) return;
    try {
      await updateSession(id, { notes: notesText });
    } catch {
      toast({ description: "Failed to save notes" });
    }
  }, [id, notesText, toast]);

  const handleSaveAsTemplate = useCallback(async () => {
    if (!id || saving) return;
    setSaving(true);
    try {
      const truncatedName = templateName.slice(0, 100).trim() || "Untitled Template";
      await createTemplateFromSession(id, truncatedName);
      setTemplateModalVisible(false);
      toast({ description: "Template saved!" });
    } catch {
      toast({ description: "Failed to save template" });
    } finally {
      setSaving(false);
    }
  }, [id, templateName, saving, toast]);

  return {
    rating, setRating,
    notesText, setNotesText,
    templateModalVisible, setTemplateModalVisible,
    templateName, setTemplateName,
    saving,
    previewVisible, setPreviewVisible,
    imageLoading, setImageLoading,
    stravaPreviewVisible, setStravaPreviewVisible,
    stravaImageLoading, setStravaImageLoading,
    achievementPreviewVisible, setAchievementPreviewVisible,
    achievementImageLoading, setAchievementImageLoading,
    shareSheetRef, shareCardRef, stravaCardRef, achievementCardRef,
    handleShareImage, handleCaptureAndShare,
    handleStravaImage, handleCaptureStravaAndShare,
    handleAchievementImage, handleCaptureAchievementAndShare,
    handleShareButtonPress,
    handleRatingChange, handleNotesSave, handleSaveAsTemplate,
  };
}
