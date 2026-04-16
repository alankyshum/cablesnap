import { ScrollView, StyleSheet } from "react-native";
import { Card, useTheme } from "react-native-paper";
import { router } from "expo-router";
import { useLayout } from "../../lib/layout";
import ProfileForm from "../../components/ProfileForm";

export default function ProfileScreen() {
  const theme = useTheme();
  const layout = useLayout();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
    >
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <ProfileForm onSave={() => router.back()} />
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: 16, paddingBottom: 32 },
  card: { marginBottom: 16 },
});
