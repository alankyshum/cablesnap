import { useCallback } from "react";
import { Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { softDeleteProgram } from "../lib/programs";
import { deleteTemplate, duplicateTemplate, duplicateProgram, importCoachTemplates, startSession, validateCoachTemplateImportData } from "../lib/db";
import type { Program, WorkoutTemplate } from "../lib/types";
import { STARTER_TEMPLATES } from "../lib/starter-templates";
import { bumpQueryVersion } from "../lib/query";
import { useToast } from "../components/ui/bna-toast";

export function useHomeActions() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { info, success, error } = useToast();
  const reload = useCallback(() => queryClient.invalidateQueries({ queryKey: ["home"] }), [queryClient]);
  const starterMeta = useCallback((id: string) => STARTER_TEMPLATES.find((s) => s.id === id), []);

  const quickStart = useCallback(async () => { const s = await startSession(null, "Quick Workout"); bumpQueryVersion("home"); router.push(`/session/${s.id}`); }, [router]);

  const startFromTemplate = useCallback(async (tpl: WorkoutTemplate) => { const s = await startSession(tpl.id, tpl.name); bumpQueryVersion("home"); router.push(`/session/${s.id}?templateId=${tpl.id}`); }, [router]);

  const confirmDelete = useCallback((tpl: WorkoutTemplate) => {
    if (tpl.is_starter) return;
    Alert.alert("Delete Template", `Delete "${tpl.name}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: async () => { await deleteTemplate(tpl.id); bumpQueryVersion("home"); reload(); } }]);
  }, [reload]);

  const confirmDeleteProgram = useCallback((prog: Program) => {
    if (prog.is_starter) return;
    Alert.alert("Delete Program", `Delete "${prog.name}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: async () => { await softDeleteProgram(prog.id); bumpQueryVersion("home"); reload(); } }]);
  }, [reload]);

  const handleDuplicateTemplate = useCallback(async (tpl: WorkoutTemplate) => { const id = await duplicateTemplate(tpl.id); bumpQueryVersion("home"); reload(); router.push(`/template/${id}`); }, [reload, router]);
  const handleDuplicateProgram = useCallback(async (prog: Program) => { const id = await duplicateProgram(prog.id); bumpQueryVersion("home"); reload(); router.push(`/program/${id}`); }, [reload, router]);

  const showTemplateOptions = useCallback((item: WorkoutTemplate) => {
    const meta = starterMeta(item.id);
    Alert.alert(meta?.name || item.name, undefined, [{ text: "Duplicate", onPress: () => handleDuplicateTemplate(item) }, { text: "Cancel", style: "cancel" }]);
  }, [starterMeta, handleDuplicateTemplate]);

  const showProgramOptions = useCallback((item: Program) => {
    Alert.alert(item.name, undefined, [{ text: "Duplicate", onPress: () => handleDuplicateProgram(item) }, { text: "Cancel", style: "cancel" }]);
  }, [handleDuplicateProgram]);

  const importTemplates = useCallback(async () => {
    try {
      // Minimal coach template JSON:
      // { "version": 1, "templates": [{ "name": "Push Day", "exercises": [{ "exercise_id": "ex-1", "target_sets": 3, "target_reps": "8-12", "rest_seconds": 90, "set_types": ["warmup", "normal", "failure"] }] }] }
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const file = new File(result.assets[0].uri);
      const raw = await file.text();

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        error("Invalid template file");
        return;
      }

      const validated = validateCoachTemplateImportData(parsed);
      if (!validated.success) {
        error(validated.error);
        return;
      }

      const importedIds = await importCoachTemplates(validated.data);
      if (importedIds.length === 0) {
        info("No templates imported");
        return;
      }

      bumpQueryVersion("home");
      reload();
      success(importedIds.length === 1 ? "1 template imported" : `${importedIds.length} templates imported`);
    } catch {
      error("Template import failed");
    }
  }, [error, info, reload, success]);

  return { router, info, reload, starterMeta, quickStart, startFromTemplate, confirmDelete, confirmDeleteProgram, showTemplateOptions, showProgramOptions, importTemplates };
}
