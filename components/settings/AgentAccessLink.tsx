import { t } from "@lingui/core/macro";
import { useRouter } from "expo-router";
import { SettingsLinkRow } from "./SettingsLinkRow";
import type { ThemeColors } from "@/hooks/useThemeColors";

export function AgentAccessLink({ colors }: { colors: ThemeColors }) {
  const router = useRouter();
  return (
    <SettingsLinkRow
      colors={colors}
      title={t({ id: "settings.integrations.agentAccess", message: "Agent access" })}
      caption={t({ id: "settings.integrations.agentAccessCaption", message: "Share temporary workout access with your own AI agent." })}
      accessibilityLabel={t({ id: "settings.integrations.agentAccessA11y", message: "Open Agent access settings" })}
      onPress={() => router.push("/settings/agent-access")}
      testID="settings-agent-access"
    />
  );
}
