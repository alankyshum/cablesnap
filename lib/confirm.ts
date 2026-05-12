import { Alert, Platform } from "react-native";

/**
 * Show a confirm dialog (Cancel + confirm button).
 *
 * @param title         dialog title
 * @param message       dialog body
 * @param onConfirm     callback when confirm button tapped
 * @param destructive   when true, confirm button uses red destructive style and
 *                      defaults to label "Delete"; when false, uses default
 *                      style and defaults to label "OK". Default: true.
 * @param confirmLabel  optional explicit confirm-button label that overrides
 *                      the destructive-default ("Delete" / "OK"). Use this to
 *                      label non-destructive confirm actions clearly (e.g.
 *                      "Complete", "Save", "Apply"). Backward-compatible:
 *                      omitting it preserves prior behavior. (BLD-1207 / GH#589)
 */
export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  destructive = true,
  confirmLabel?: string
): void {
  const label = confirmLabel ?? (destructive ? "Delete" : "OK");
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    {
      text: label,
      style: destructive ? "destructive" : "default",
      onPress: onConfirm,
    },
  ]);
}
