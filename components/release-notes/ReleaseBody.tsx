import { Linking, Platform, StyleSheet, type TextStyle, View } from "react-native";
import type { ReactNode } from "react";
import { Text } from "@/components/ui/text";
import { fontSizes } from "@/constants/design-tokens";

export type MarkdownColors = { primary: string; surfaceVariant: string };

export function parseInlineMarkdown(line: string, style: TextStyle, colors: MarkdownColors): ReactNode[] {
  const tokenPattern = /`[^`\n]+`|\[[^\]\n]+\]\([^\n)]+\)|\*\*[^*\n]+\*\*|(?<!\*)\*[^*\n]+\*(?!\*)|(?<!_)_[^_\n]+_(?!_)/g;
  const spans: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let spanIndex = 0;
  while ((match = tokenPattern.exec(line)) !== null) {
    if (match.index > lastIndex) spans.push(<Text key={`span-${spanIndex++}`} style={style}>{line.slice(lastIndex, match.index)}</Text>);
    const token = match[0];
    if (token.startsWith("`")) spans.push(<Text key={`span-${spanIndex++}`} style={[style, { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), backgroundColor: colors.surfaceVariant, fontSize: typeof style.fontSize === "number" ? style.fontSize - 1 : undefined, paddingHorizontal: 3 }]}>{token.slice(1, -1)}</Text>);
    else if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) { const [, label, url] = linkMatch; spans.push(<Text key={`span-${spanIndex++}`} style={[style, { color: colors.primary, textDecorationLine: "underline" }]} accessibilityRole="link" onPress={() => { if (/^(?:https?:\/\/|mailto:)/i.test(url)) Linking.openURL(url).catch(() => {}); }}>{label}</Text>); }
    } else {
      const isBold = token.startsWith("**");
      spans.push(<Text key={`span-${spanIndex++}`} style={[style, isBold ? { fontWeight: "700" } : { fontStyle: "italic" }]}>{token.slice(isBold ? 2 : 1, isBold ? -2 : -1)}</Text>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < line.length) spans.push(<Text key={`span-${spanIndex}`} style={style}>{line.slice(lastIndex)}</Text>);
  return spans;
}

export function ReleaseBody({ body, color, colors, fontSize, lineHeight }: { body: string; color: string; colors: MarkdownColors; fontSize: number; lineHeight: number }) {
  const textStyle: TextStyle = { color, fontSize, lineHeight };
  return <View>{body.split("\n").map((line, index) => {
    const bulletMatch = line.match(/^\s*- (.*)$/);
    const headingMatch = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (bulletMatch) return <View key={`line-${index}`} style={styles.bodyBulletRow}><Text style={[textStyle, styles.bodyBullet]}>•</Text><Text style={[textStyle, styles.bodyBulletText]}>{parseInlineMarkdown(bulletMatch[1], textStyle, colors)}</Text></View>;
    if (headingMatch) { const headingStyle: TextStyle = { ...textStyle, fontSize: Math.min(fontSizes.heading, fontSize + 7 - headingMatch[1].length), fontWeight: "700", marginTop: 4, marginBottom: 2 }; return <Text key={`line-${index}`} style={headingStyle} accessibilityRole="header">{parseInlineMarkdown(headingMatch[2], headingStyle, colors)}</Text>; }
    return <Text key={`line-${index}`} style={textStyle}>{line ? parseInlineMarkdown(line, textStyle, colors) : "\u00a0"}</Text>;
  })}</View>;
}

const styles = StyleSheet.create({ bodyBulletRow: { flexDirection: "row" }, bodyBullet: { width: 16 }, bodyBulletText: { flex: 1 } });
