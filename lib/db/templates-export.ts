import { Alert } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getTemplateById } from "./templates";
import { validateCoachTemplateImportData } from "../schemas";
import type { WorkoutTemplate } from "../types";

function sanitizeTemplateFilename(name: string): string {
  const sanitized = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return sanitized.length > 0 ? sanitized : "template";
}

function countUniqueCustomOrUnresolved(tpl: WorkoutTemplate): number {
  return new Set(
    (tpl.exercises ?? [])
      .filter((e) => !e.exercise || e.exercise.is_custom === true)
      .map((e) => e.exercise_id)
  ).size;
}

function buildExportPayload(tpl: WorkoutTemplate) {
  return {
    version: 1 as const,
    templates: [
      {
        name: tpl.name.trim(),
        exercises: (tpl.exercises ?? []).map((ex) => ({
          exercise_id: ex.exercise_id,
          target_sets: ex.target_sets,
          target_reps: ex.target_reps,
          rest_seconds: ex.rest_seconds,
          ...(ex.link_id != null ? { link_id: ex.link_id } : {}),
          ...(ex.link_label ? { link_label: ex.link_label } : {}),
          ...(ex.target_duration_seconds != null
            ? { target_duration_seconds: ex.target_duration_seconds }
            : {}),
          ...(ex.set_types?.length ? { set_types: ex.set_types } : {}),
        })),
      },
    ],
  };
}

async function doExport(tpl: WorkoutTemplate): Promise<void> {
  const payload = buildExportPayload(tpl);

  // Pre-write validation — catches exporter bugs before file write
  const validation = validateCoachTemplateImportData(payload);
  if (!validation.success) {
    throw new Error(`Export payload invalid: ${validation.error}`);
  }

  const filename = `cablesnap-template-${sanitizeTemplateFilename(tpl.name)}.json`;
  const file = new File(Paths.cache, filename);
  await file.write(JSON.stringify(payload, null, 2));

  await Sharing.shareAsync(file.uri, {
    mimeType: "application/json",
    dialogTitle: "Export Template",
  });
}

export async function exportCoachTemplate(templateId: string): Promise<void> {
  // Pre-share guard: must be first, before any file I/O
  const sharingAvailable = await Sharing.isAvailableAsync();
  if (!sharingAvailable) {
    throw new Error("Sharing not available on this device");
  }

  // Mandatory hydration: getTemplates() returns thin records without exercises
  const tpl = await getTemplateById(templateId);
  if (!tpl) {
    throw new Error("Template not found");
  }

  if (!tpl.exercises || tpl.exercises.length === 0) {
    throw new Error("Cannot export empty template");
  }

  const uniqueCustom = countUniqueCustomOrUnresolved(tpl);

  if (uniqueCustom > 0) {
    await new Promise<void>((resolve, reject) => {
      Alert.alert(
        "Custom Exercises",
        `This template uses ${uniqueCustom} custom exercise${uniqueCustom === 1 ? "" : "s"}. The exported file will only import correctly on devices where the same custom exercises exist.`,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => reject(new Error("cancelled")),
          },
          {
            text: "Export anyway",
            onPress: () => resolve(),
          },
        ]
      );
    });
  }

  await doExport(tpl);
}

// Exported for unit testing
export { sanitizeTemplateFilename, buildExportPayload, countUniqueCustomOrUnresolved };
