import { Alert, Platform } from "react-native";

export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  destructive = true
): void {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    {
      text: destructive ? "Delete" : "OK",
      style: destructive ? "destructive" : "default",
      onPress: onConfirm,
    },
  ]);
}
