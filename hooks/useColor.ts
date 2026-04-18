import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/theme/colors";

export function useColor(
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark,
  props?: { light?: string; dark?: string }
) {
  const scheme = useColorScheme() ?? "light";
  const theme = scheme === "dark" ? "dark" : "light";
  const colorFromProps = props?.[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}
