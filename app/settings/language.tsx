import { Pressable, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { Check } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { spacing } from "@/constants/design-tokens";
import { useLanguage } from "@/lib/language-preference";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n";
import { useLingui } from "@lingui/react/macro";

function translatedLanguageName(locale: SupportedLocale, t: ReturnType<typeof useLingui>["t"]): string {
  switch (locale) {
    case "en-US": return t({ id: "settings.language.enUS", message: "English (US)" });
    case "en-GB": return t({ id: "settings.language.enGB", message: "English (UK)" });
    case "zh-TW": return t({ id: "settings.language.zhTW", message: "繁體中文" });
    case "zh-CN": return t({ id: "settings.language.zhCN", message: "简体中文" });
  }
}

export default function LanguageSettings() {
  const colors = useThemeColors();
  const { language, setLanguage } = useLanguage();
  const { t } = useLingui();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: t({ id: "settings.language.title", message: "Language" }) }} />
      {SUPPORTED_LOCALES.map((locale) => {
        const selected = locale === language;
        const languageName = translatedLanguageName(locale, t);
        return (
          <Pressable
            key={locale}
            onPress={() => setLanguage(locale)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={languageName}
            testID={`language-option-${locale}`}
            style={({ pressed }) => [
              styles.option,
              { borderBottomColor: colors.outline, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text variant="body" style={{ color: colors.onSurface }}>
              {languageName}
            </Text>
            {selected ? <Check size={20} color={colors.primary} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.base,
  },
  option: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
