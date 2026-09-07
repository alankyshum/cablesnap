import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { spacing, radii } from "@/constants/design-tokens";
import { useToast } from "@/components/ui/bna-toast";
import KeyStatusCard from "@/components/settings/KeyStatusCard";
import { get, set, delete as deleteKey, has, keyFormat } from "@/lib/ai/key-vault";
import { parseOpenRouterError, toChatErrorState, type AIError } from "@/lib/ai/errors";
import { useQueryClient } from "@tanstack/react-query";
import { keyStatusQueryKey } from "@/hooks/useKeyStatus";
import { fetch as expoFetch } from "expo/fetch";

const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";

export default function AIKeySettingsScreen() {
  const colors = useThemeColors();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    void has().then((value) => {
      if (active) {
        setSaved(value);
        setReady(true);
      }
    });
    return () => { active = false; };
  }, []));

  async function saveKey() {
    const value = draft.trim();
    if (!keyFormat(value)) {
      setValidation("Enter a valid OpenRouter key.");
      return;
    }
    setBusy(true);
    try {
      await set(value);
      await queryClient.invalidateQueries({ queryKey: keyStatusQueryKey });
      setDraft("");
      setSaved(true);
      setValidation(null);
      toast.success("OpenRouter key saved");
    } catch {
      setValidation("The key could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function validateKey() {
    setBusy(true);
    setValidation(null);
    try {
      const key = await get();
      if (!key) {
        showTypedError({ kind: "missing_key" });
        return;
      }
      const response = await expoFetch(OPENROUTER_KEY_URL, {
        method: "GET",
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!response.ok) {
        showTypedError(parseOpenRouterError(response.status, null));
        return;
      }
      setValidation("Your key is valid.");
    } catch {
      showTypedError({ kind: "network_error" });
    } finally {
      setBusy(false);
    }
  }

  function showTypedError(error: AIError) {
    setValidation(toChatErrorState(error).message);
  }

  async function removeKey() {
    setBusy(true);
    try {
      await deleteKey();
      await queryClient.invalidateQueries({ queryKey: keyStatusQueryKey });
      setSaved(false);
      setDraft("");
      setValidation(null);
      toast.success("OpenRouter key removed");
    } catch {
      setValidation("The key could not be removed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "AI Provider" }} />
      <Text variant="heading" style={{ color: colors.onSurface }}>Connect OpenRouter</Text>
      <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
        Add your own OpenRouter API key to use AI Coach.
      </Text>
      <Card style={{ backgroundColor: colors.surface }}>
        <CardContent>
          <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: spacing.sm }}>
            OpenRouter API key
          </Text>
          {!ready ? (
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>Loading key status…</Text>
          ) : saved ? (
            <View style={[styles.masked, { borderColor: colors.onSurfaceVariant }]}>
              <Text variant="body" style={{ color: colors.onSurface }}>••••••••••••••••••••</Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>Saved securely on this device</Text>
            </View>
          ) : (
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="sk-or-v1-..."
              placeholderTextColor={colors.onSurfaceVariant}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="OpenRouter API key"
              testID="openrouter-key-input"
              style={[styles.input, { color: colors.onSurface, borderColor: colors.onSurfaceVariant }]}
            />
          )}
          <View style={styles.actions}>
            {!saved && <Action label="Save key" onPress={saveKey} colors={colors} disabled={busy} />}
            {saved && <Action label="Validate" onPress={validateKey} colors={colors} disabled={busy} />}
            {saved && <Action label="Remove" onPress={removeKey} colors={colors} disabled={busy} />}
          </View>
          {validation && <Text variant="caption" style={{ color: colors.onSurface, marginTop: spacing.sm }}>{validation}</Text>}
        </CardContent>
      </Card>
      <KeyStatusCard />
      <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
        This key is stored on this device only and sent directly to OpenRouter; there is no server of ours in between.
      </Text>
    </ScrollView>
  );
}

function Action({ label, onPress, colors, disabled }: { label: string; onPress: () => void; colors: ReturnType<typeof useThemeColors>; disabled: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.button, { borderColor: colors.onSurface, opacity: disabled ? 0.5 : 1 }]}>
      <Text variant="body" style={{ color: colors.onSurface, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.base, gap: spacing.md },
  input: { borderWidth: 1, borderRadius: radii.sm, padding: spacing.md, fontSize: 16 },
  masked: { borderWidth: 1, borderRadius: radii.sm, padding: spacing.md, gap: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  button: { borderWidth: 1, borderRadius: radii.sm, minHeight: 48, justifyContent: "center", paddingHorizontal: spacing.md },
});
