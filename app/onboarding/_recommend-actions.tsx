import { Button } from "@/components/ui/button";
import { styles } from "./_recommend-styles";

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
      >
        {primaryLabel}
      </Button>
      <Button
        variant="ghost"
        onPress={onSkip}
        style={styles.skip}
        disabled={saving}
        accessibilityLabel="Skip recommendation and explore on your own"
        label="I'll explore on my own"
      />
    </>
  );
}
