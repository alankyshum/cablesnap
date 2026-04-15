import { ScrollView, StyleSheet } from "react-native";
import { Card, useTheme } from "react-native-paper";
import { router } from "expo-router";
import ProfileForm from "../../components/ProfileForm";

export default function ProfileScreen() {
  const theme = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
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
  content: { padding: 16, paddingBottom: 32 },
  card: { marginBottom: 16 },
});
