/**
 * ClipThumbImage — renders a real video frame thumbnail for a form clip,
 * generated + cached via getOrCreateThumb (expo-video-thumbnails). Falls back
 * to a video glyph while loading or on error.
 */
import React, { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getOrCreateThumb } from "@/lib/media/form-clip-thumbs";
import { useThemeColors } from "@/hooks/useThemeColors";

type Props = { setId: string; relPath: string; style?: object; iconSize?: number };

export function ClipThumbImage({ setId, relPath, style, iconSize = 24 }: Props) {
  const colors = useThemeColors();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    getOrCreateThumb(setId, relPath)
      .then((u) => { if (alive) setUri(u); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [setId, relPath]);
  if (uri && !failed) {
    return <Image source={{ uri }} style={[styles.img, style]} resizeMode="cover" />;
  }
  return (
    <View style={[styles.fallback, style]}>
      <MaterialCommunityIcons name="video" size={iconSize} color={colors.onSurfaceVariant} />
    </View>
  );
}

const styles = StyleSheet.create({
  img: { width: "100%", height: "100%" },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center" },
});
