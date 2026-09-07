import { Button } from "@/components/ui/button";
import { styles } from "./recommend-styles";
import { t } from "@lingui/core/macro";

export function RecommendActions({
  primaryLabel,
  onPrimary,
  onSkip,
  saving,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  onSkip: () => void;
  saving: boolean;
}) {
  return (
    <>
      <Button
        variant="default"
        onPress={onPrimary}
        style={styles.btn}
        loading={saving}
        disabled={saving}
         accessibilityLabel={primaryLabel}
         label={primaryLabel}
      >
      </Button>
      <Button
        variant="ghost"
        onPress={onSkip}
        style={styles.skip}
        disabled={saving}
         accessibilityLabel={t({ id: "components.onboarding.recommendActions.skipA11y", message: "Skip recommendation and explore on your own" })}
         label={t({ id: "components.onboarding.recommendActions.skip", message: "I'll explore on my own" })}
      />
    </>
  );
}
