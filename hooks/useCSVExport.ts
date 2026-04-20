import { useState } from "react";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useToast } from "@/components/ui/bna-toast";
import {
  getWorkoutCSVData,
  getNutritionCSVData,
  getBodyWeightCSVData,
  getBodyMeasurementsCSVData,
} from "@/lib/db";
import { workoutCSV, nutritionCSV, bodyWeightCSV, bodyMeasurementsCSV } from "@/lib/csv-format";

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function sinceForRange(range: string): number {
  if (range === "all") return 0;
  return Date.now() - Number(range) * 86_400_000;
}

type CSVConfig = {
  fetcher: (since: number) => Promise<unknown[]>;
  formatter: (rows: unknown[]) => string;
  prefix: string;
  dialogTitle: string;
};

const CSV_CONFIGS: Record<string, CSVConfig> = {
  workouts: { fetcher: getWorkoutCSVData as (s: number) => Promise<unknown[]>, formatter: workoutCSV as (r: unknown[]) => string, prefix: "cablesnap-workouts", dialogTitle: "Export Workouts CSV" },
  nutrition: { fetcher: getNutritionCSVData as (s: number) => Promise<unknown[]>, formatter: nutritionCSV as (r: unknown[]) => string, prefix: "cablesnap-nutrition", dialogTitle: "Export Nutrition CSV" },
  bodyWeight: { fetcher: getBodyWeightCSVData as (s: number) => Promise<unknown[]>, formatter: bodyWeightCSV as (r: unknown[]) => string, prefix: "cablesnap-body-weight", dialogTitle: "Export Body Weight CSV" },
  bodyMeasurements: { fetcher: getBodyMeasurementsCSVData as (s: number) => Promise<unknown[]>, formatter: bodyMeasurementsCSV as (r: unknown[]) => string, prefix: "cablesnap-body-measurements", dialogTitle: "Export Body Measurements CSV" },
};

export { sinceForRange };

export function useCSVExport() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const exportCSV = async (type: keyof typeof CSV_CONFIGS, range: string) => {
    const config = CSV_CONFIGS[type];
    if (!config) return;

    setLoading(true);
    try {
      const rows = await config.fetcher(sinceForRange(range));
      if (rows.length === 0) { toast.info("No data to export"); setLoading(false); return; }
      const csv = config.formatter(rows);
      const file = new File(Paths.cache, `${config.prefix}-${dateStamp()}.csv`);
      await file.write(csv);
      await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: config.dialogTitle });
    } catch {
      toast.error("Export failed");
    } finally {
      setLoading(false);
    }
  };

  return { loading, setLoading, exportCSV, toast };
}
