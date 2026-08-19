import { Stack } from "expo-router";
import { t } from "@lingui/core/macro";

export default function ProgressLayout() {
  return <Stack screenOptions={{ headerBackTitle: t({ id: "app.progress.layout.back", message: "Back" }) }} />;
}
