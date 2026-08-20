import { useLingui } from "@lingui/react/macro";
import { Check, ChevronDown } from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import { Dimensions, Modal, Pressable, StyleSheet, View } from "react-native";
import { elevation, fontSizes, radii, spacing } from "@/constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { SupportedLocale } from "@/lib/i18n";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { translatedLanguageName } from "@/lib/i18n/language-names";
import { Text } from "./text";

type Props = { value: SupportedLocale; onChange: (value: SupportedLocale) => void; label: string };

export function LanguageDropdown({ value, onChange, label }: Props) {
  const colors = useThemeColors();
  const { t } = useLingui();
  const trigger = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const measure = useCallback(() => {
    trigger.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  }, []);
  const openMenu = () => { measure(); setOpen(true); };
  const close = () => setOpen(false);
  const menuHeight = SUPPORTED_LOCALES.length * 48;
  const top = anchor.y + anchor.height + menuHeight > Dimensions.get("window").height - spacing.sm
    ? Math.max(spacing.sm, anchor.y - menuHeight)
    : anchor.y + anchor.height;
  const currentName = translatedLanguageName(value);
  return (
    <>
      <View ref={trigger} onLayout={measure} collapsable={false}>
        <Pressable
          testID="language-picker-trigger"
          onPress={openMenu}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${currentName}`}
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => [styles.trigger, { borderColor: colors.outline, opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={styles.triggerText}>
            <Text variant="body" style={{ color: colors.onSurface }}>{label}</Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{t({ id: "settings.language.caption", message: "Choose the language used throughout the app." })}</Text>
          </View>
          <View style={styles.value}><Text variant="body" style={{ color: colors.primary, fontSize: fontSizes.sm }}>{currentName}</Text><ChevronDown size={20} color={colors.primary} /></View>
        </Pressable>
      </View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={[styles.backdrop, { backgroundColor: colors.scrim }]} onPress={close} accessibilityLabel={t({ id: "common.close", message: "Close" })} />
          <View style={[styles.menu, { top, left: anchor.x, width: anchor.width, backgroundColor: colors.surface, borderColor: colors.outline }]}>
            {SUPPORTED_LOCALES.map((locale) => {
              const selected = locale === value;
               return <Pressable key={locale} testID={`language-option-${locale}`} onPress={() => { onChange(locale); close(); }} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={translatedLanguageName(locale)} style={({ pressed }) => [styles.option, { opacity: pressed ? 0.7 : 1 }]}>
                <Text variant="body" style={{ color: colors.onSurface }}>{translatedLanguageName(locale)}</Text>
                {selected ? <Check size={20} color={colors.primary} /> : null}
              </Pressable>;
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  triggerText: { flex: 1, gap: spacing.xs },
  value: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginLeft: spacing.sm },
  backdrop: { ...StyleSheet.absoluteFillObject },
  menu: { position: "absolute", borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.md, ...elevation.low },
  option: { minHeight: 48, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
