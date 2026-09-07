import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/hooks/useThemeColors";
import { radii, spacing } from "@/constants/design-tokens";
import { t } from "@/lib/i18n";

export function CoachDraftRevisionSheet({ visible, revisions, currentVersion, restoring, onClose, onRestore }: {
  visible: boolean; revisions: Array<{ version: number; change_reason: string; created_at: number }>;
  currentVersion: number; restoring?: boolean; onClose: () => void; onRestore: (version: number) => void;
}) {
  const colors = useThemeColors();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
      <View testID="coach-draft-revision-sheet" accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.surface }]}>
        <Text variant="title" style={{ color: colors.onSurface }}>{t({ id: "components.coach.draftRevisionHistory", message: "Revision history" })}</Text>
        <ScrollView accessibilityRole="list" contentContainerStyle={styles.list}>
          {revisions.map((revision) => <View key={revision.version} style={styles.row}>
            <View style={styles.copy}><Text style={{ color: colors.onSurface }}>{t({ id: "components.coach.draftRevisionLabel", message: "Revision {version}" }, { version: revision.version })}</Text><Text style={{ color: colors.onSurfaceVariant }}>{revision.change_reason}</Text></View>
            {revision.version !== currentVersion && <Pressable accessibilityRole="button" accessibilityLabel={t({ id: "components.coach.restoreRevisionA11y", message: "Restore revision {version}" }, { version: revision.version })} disabled={restoring} onPress={() => onRestore(revision.version)}><Text style={{ color: colors.primary }}>{t({ id: "components.coach.restoreRevision", message: "Restore" })}</Text></Pressable>}
          </View>)}
        </ScrollView>
        <Button variant="outline" onPress={onClose} label={t({ id: "components.coach.closeRevisionHistory", message: "Close revision history" })} />
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { maxHeight: "80%", borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing.lg, gap: spacing.md },
  list: { gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  copy: { flex: 1, gap: spacing.xs },
});
