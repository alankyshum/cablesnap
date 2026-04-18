import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import BottomSheet from "@gorhom/bottom-sheet";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { captureRef } from "react-native-view-shot";
import { useToast } from "@/components/ui/bna-toast";
import { createTemplateFromSession, updateSession } from "@/lib/db";

export function useSummaryActions(id: string | undefined) {
  const { toast } = useToast();
  const [rating, setRating] = useState<number | null>(null);
  const [notesText, setNotesText] = useState("");
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const shareSheetRef = useRef<BottomSheet>(null);
  const shareCardRef = useRef<View>(null);

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

  const handleShareButtonPress = useCallback(() => {
    shareSheetRef.current?.snapToIndex(0);
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
    notesExpanded, setNotesExpanded,
    templateModalVisible, setTemplateModalVisible,
    templateName, setTemplateName,
    saving,
    previewVisible, setPreviewVisible,
    imageLoading, setImageLoading,
    shareSheetRef, shareCardRef,
    handleShareImage, handleCaptureAndShare, handleShareButtonPress,
    handleRatingChange, handleNotesSave, handleSaveAsTemplate,
  };
}
