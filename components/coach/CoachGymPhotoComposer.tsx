import React from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from "react-native";
import { Image as ImageIcon, X } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { radii, spacing } from "@/constants/design-tokens";
import { t } from "@/lib/i18n";

export function CoachGymPhotoComposer({ hasPhoto, previewUri, disabled, disclosure, onPick, onRemove }: { hasPhoto: boolean; previewUri?: string; disabled?: boolean; disclosure?: string; onPick: () => Promise<void> | void; onRemove: () => void }) {
  const colors = useThemeColors();
  const [loading, setLoading] = React.useState(false);
  const pick = async () => { if (loading || disabled) return; setLoading(true); try { await onPick(); } finally { setLoading(false); } };
  return <View style={styles.container}>{disclosure && <Text accessibilityLabel={disclosure} style={{ color: colors.onSurfaceVariant }}>{disclosure}</Text>}<View style={styles.row}><Pressable testID="coach-gym-photo-button" accessibilityRole="button" accessibilityLabel={t({ id: "components.coach.chooseGymPhoto", message: "Choose a gym photo from your library" })} accessibilityHint={t({ id: "components.coach.libraryOnlyHint", message: "Library only; no camera capture" })} accessibilityState={{ disabled: disabled || loading, busy: loading }} disabled={disabled || loading} onPress={() => void pick()} style={[styles.button, { borderColor: colors.outlineVariant }]}>{loading ? <ActivityIndicator color={colors.primary} /> : <ImageIcon size={18} color={colors.onSurfaceVariant} />}</Pressable>{hasPhoto && <><View accessibilityRole="image" accessibilityLabel={t({ id: "components.coach.gymPhotoReady", message: "Selected gym photo ready to send" })}>{previewUri ? <Image source={{ uri: previewUri }} style={styles.preview} /> : <ImageIcon size={18} color={colors.primary} />}</View><Pressable accessibilityRole="button" accessibilityLabel={t({ id: "components.coach.removeGymPhoto", message: "Remove selected gym photo" })} onPress={onRemove}><X size={18} color={colors.onSurfaceVariant} /></Pressable></>}</View></View>;
}
const styles = StyleSheet.create({ container: { gap: spacing.xs }, row: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, button: { width: 44, height: 44, borderWidth: 1, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" }, preview: { width: 40, height: 40, borderRadius: radii.sm } });
