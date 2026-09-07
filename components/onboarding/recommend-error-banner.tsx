import { View } from "react-native";
import { Alert as AlertComponent, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { t } from "@lingui/core/macro";

export function ErrorBanner({
  error,
  onRetry,
  onSkip,
}: {
  error: string | null;
  onRetry: () => void;
  onSkip: () => void;
}) {
  if (!error) return null;
  return (
    <AlertComponent variant="destructive" style={{ marginBottom: 16 }}>
      <AlertDescription>{error}</AlertDescription>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
         <Button variant="outline" onPress={onRetry} label={t({ id: "components.onboarding.recommendError.retry", message: "Retry" })} size="sm" />
         <Button variant="ghost" onPress={onSkip} label={t({ id: "components.onboarding.recommendError.skip", message: "Skip" })} size="sm" />
      </View>
    </AlertComponent>
  );
}
