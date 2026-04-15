import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { ActivityIndicator, Button, Card, Text, useTheme } from "react-native-paper";
import { useFocusEffect } from "@react-navigation/native";
import { getAppSetting } from "../lib/db";
import {
  ACTIVITY_LABELS,
  GOAL_LABELS,
  type NutritionProfile,
} from "../lib/nutrition-calc";
import ProfileForm from "./ProfileForm";

type CardState = "loading" | "error" | "cta" | "summary";

interface SummaryItem {
  label: string;
  value: string;
  a11yLabel: string;
}

function ProfileFormErrorBoundaryFallback({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ padding: 24, alignItems: "center" }}>
      <Text variant="titleMedium" style={{ color: theme.colors.error, marginBottom: 12 }}>
        Something went wrong
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16, textAlign: "center" }}>
        The profile form encountered an error. Please close and try again.
      </Text>
      <Button mode="contained" onPress={onClose} accessibilityLabel="Close profile form" contentStyle={{ paddingVertical: 8 }}>
        Close
      </Button>
    </View>
  );
}

class ProfileFormErrorBoundary extends React.Component<
  { children: React.ReactNode; onClose: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <ProfileFormErrorBoundaryFallback onClose={this.props.onClose} />;
    }
    return this.props.children;
  }
}

export default function BodyProfileCard() {
  const theme = useTheme();
  const [cardState, setCardState] = useState<CardState>("loading");
  const [profile, setProfile] = useState<NutritionProfile | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [dirty, setDirty] = useState(false);

  const loadProfile = useCallback(async () => {
    setCardState("loading");
    try {
      const saved = await getAppSetting("nutrition_profile");
      if (saved) {
        setProfile(JSON.parse(saved));
        setCardState("summary");
      } else {
        setProfile(null);
        setCardState("cta");
      }
    } catch {
      setCardState("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  function handleOverlayPress() {
    if (dirty) {
      Alert.alert(
        "Discard changes?",
        "You have unsaved changes. Are you sure you want to close?",
        [
          { text: "Keep Editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              setDirty(false);
              setModalVisible(false);
            },
          },
        ]
      );
    } else {
      setModalVisible(false);
    }
  }

  function handleSave() {
    setDirty(false);
    setModalVisible(false);
    loadProfile();
  }

  function handleCancel() {
    handleOverlayPress();
  }

  function buildSummaryItems(p: NutritionProfile): SummaryItem[] {
    return [
      { label: "Sex", value: p.sex === "male" ? "Male" : "Female", a11yLabel: `Sex: ${p.sex === "male" ? "Male" : "Female"}` },
      { label: "Age", value: `${p.age} years`, a11yLabel: `Age: ${p.age} years` },
      { label: "Weight", value: `${p.weight} ${p.weightUnit}`, a11yLabel: `Weight: ${p.weight} ${p.weightUnit === "kg" ? "kilograms" : "pounds"}` },
      { label: "Height", value: `${p.height} ${p.heightUnit}`, a11yLabel: `Height: ${p.height} ${p.heightUnit === "cm" ? "centimeters" : "inches"}` },
      { label: "Activity", value: ACTIVITY_LABELS[p.activityLevel], a11yLabel: `Activity level: ${ACTIVITY_LABELS[p.activityLevel]}` },
      { label: "Goal", value: GOAL_LABELS[p.goal], a11yLabel: `Goal: ${GOAL_LABELS[p.goal]}` },
    ];
  }

  const renderCardContent = () => {
    switch (cardState) {
      case "loading":
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" />
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}
            >
              Loading profile…
            </Text>
          </View>
        );

      case "error":
        return (
          <View>
            <Text variant="bodyMedium" style={{ color: theme.colors.error, marginBottom: 8 }}>
              Could not load profile
            </Text>
            <Button
              mode="outlined"
              onPress={loadProfile}
              compact
              accessibilityLabel="Retry loading profile"
            >
              Retry
            </Button>
          </View>
        );

      case "cta":
        return (
          <View>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 4 }}>
              Set up your body profile
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, fontSize: 13 }}>
              Get personalized nutrition targets based on your body stats
            </Text>
          </View>
        );

      case "summary": {
        if (!profile) return null;
        const items = buildSummaryItems(profile);
        return (
          <View>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 12 }}>
              Body Profile
            </Text>
            <FlatList
              data={items}
              numColumns={2}
              scrollEnabled={false}
              keyExtractor={(item) => item.label}
              renderItem={({ item }) => (
                <View
                  style={styles.summaryItem}
                  accessibilityLabel={item.a11yLabel}
                >
                  <Text
                    variant="labelSmall"
                    style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}
                  >
                    {item.label}
                  </Text>
                  <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSurface, fontSize: 14 }}
                  >
                    {item.value}
                  </Text>
                </View>
              )}
            />
          </View>
        );
      }
    }
  };

  const renderModal = () => (
    <Modal
      visible={modalVisible}
      transparent
      animationType="slide"
      onRequestClose={handleOverlayPress}
      accessibilityViewIsModal
    >
      <TouchableWithoutFeedback onPress={handleOverlayPress} accessible={false}>
        <View style={[styles.modalOverlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
          <TouchableWithoutFeedback accessible={false}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.modalKeyboard}
            >
              <View
                style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
                accessibilityViewIsModal
              >
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <ProfileFormErrorBoundary onClose={() => setModalVisible(false)}>
                    <ProfileForm
                      initialProfile={profile ?? undefined}
                      onSave={handleSave}
                      onCancel={handleCancel}
                      onDirtyChange={setDirty}
                    />
                  </ProfileFormErrorBoundary>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  return (
    <>
      <Card
        style={[styles.card, { backgroundColor: theme.colors.surface }]}
        onPress={() => cardState !== "loading" && setModalVisible(true)}
        accessibilityLabel={
          cardState === "cta"
            ? "Set up your body profile"
            : cardState === "summary"
              ? "Edit body profile"
              : undefined
        }
        accessibilityHint={
          cardState === "cta" || cardState === "summary"
            ? "Opens profile editor"
            : undefined
        }
      >
        <Card.Content>{renderCardContent()}</Card.Content>
      </Card>
      {renderModal()}
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 0 },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  summaryItem: {
    flex: 1,
    marginBottom: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalKeyboard: {
    width: "100%",
    maxWidth: 440,
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    elevation: 8,
    maxHeight: "90%",
  },
});
