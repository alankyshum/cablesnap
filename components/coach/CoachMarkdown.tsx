import React, { useMemo } from "react";
import { Linking, Platform, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useColorScheme } from "@/hooks/useColorScheme";

export type CoachMarkdownProps = {
  text: string;
  position?: "left" | "right";
  textStyle?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  onLinkPress?: (url: string) => void;
};

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "ordered"; marker: string; text: string }
  | { kind: "quote"; text: string }
  | { kind: "code"; lines: string[] }
  | { kind: "table"; lines: string[] }
  | { kind: "paragraph"; text: string };

const MONO_FONT = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

const INLINE_RE = /`([^`]+)`|\*\*([\s\S]+?)\*\*|\*([\s\S]+?)\*|_([\s\S]+?)_|~~([\s\S]+?)~~|\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s)]+)/;

const isDivider = (line: string) => {
  const values = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
  return values.length > 0 && values.every((value) => /^\s*:?-{3,}:?\s*$/.test(value));
};

const tableCells = (line: string) =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, "|").trim());

function parseInline(
  text: string,
  keyBase: string,
  textColor: string,
  linkColor: string,
  codeBg: string,
  codeBorder: string,
  linkStyle?: StyleProp<TextStyle>,
  onLinkPress?: (url: string) => void,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let rest = text;
  let index = 0;

  const handleLink = (url: string) => {
    if (onLinkPress) onLinkPress(url);
    else Linking.openURL(url).catch(() => {});
  };

  while (rest.length > 0) {
    const match = INLINE_RE.exec(rest);
    if (!match) {
      nodes.push(rest);
      break;
    }

    if (match.index > 0) {
      nodes.push(rest.slice(0, match.index));
    }

    const key = `${keyBase}.node.${index++}`;

    if (match[1] != null) {
      // `code`
      nodes.push(
        <Text key={key} style={[styles.inlineCode, { color: textColor, backgroundColor: codeBg, borderColor: codeBorder }]}>
          {match[1]}
        </Text>,
      );
    } else if (match[2] != null) {
      // **bold**
      nodes.push(
        <Text key={key} style={[styles.bold, { color: textColor }]}>
          {parseInline(match[2], key, textColor, linkColor, codeBg, codeBorder, linkStyle, onLinkPress)}
        </Text>,
      );
    } else if (match[3] != null || match[4] != null) {
      // *italic* or _italic_
      const italicContent = match[3] ?? match[4];
      nodes.push(
        <Text key={key} style={[styles.italic, { color: textColor }]}>
          {parseInline(italicContent, key, textColor, linkColor, codeBg, codeBorder, linkStyle, onLinkPress)}
        </Text>,
      );
    } else if (match[5] != null) {
      // ~~strike~~
      nodes.push(
        <Text key={key} style={[styles.strike, { color: textColor }]}>
          {parseInline(match[5], key, textColor, linkColor, codeBg, codeBorder, linkStyle, onLinkPress)}
        </Text>,
      );
    } else if (match[6] != null) {
      // [text](url)
      const url = match[7];
      nodes.push(
        <Text key={key} style={[styles.link, { color: linkColor }, linkStyle]} onPress={() => handleLink(url)}>
          {parseInline(match[6], `${key}.label`, linkColor, linkColor, codeBg, codeBorder, linkStyle, onLinkPress)}
        </Text>,
      );
    } else if (match[8] != null) {
      // bare URL
      const url = match[8];
      nodes.push(
        <Text key={key} style={[styles.link, { color: linkColor }, linkStyle]} onPress={() => handleLink(url)}>
          {url}
        </Text>,
      );
    }

    rest = rest.slice(match.index + match[0].length);
  }

  return nodes;
}

function parseCodeBlock(lines: string[], startIndex: number): { block: Block; nextIndex: number } {
  const code: string[] = [];
  let index = startIndex + 1;
  while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
    code.push(lines[index++]);
  }
  if (index < lines.length) index += 1;
  return { block: { kind: "code", lines: code }, nextIndex: index };
}

function parseTableBlock(lines: string[], startIndex: number): { block: Block; nextIndex: number } {
  const table = [lines[startIndex], lines[startIndex + 1]];
  let index = startIndex + 2;
  while (index < lines.length && lines[index].includes("|") && lines[index].trim() !== "") {
    table.push(lines[index++]);
  }
  return { block: { kind: "table", lines: table }, nextIndex: index };
}

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index];

    // Fenced code block (```lang ... ```)
    if (/^\s*```/.test(line)) {
      flushParagraph();
      const parsed = parseCodeBlock(lines, index);
      blocks.push(parsed.block);
      index = parsed.nextIndex;
      continue;
    }

    // GFM Table
    if (index + 1 < lines.length && line.includes("|") && isDivider(lines[index + 1])) {
      flushParagraph();
      const parsed = parseTableBlock(lines, index);
      blocks.push(parsed.block);
      index = parsed.nextIndex;
      continue;
    }

    // Headings (#, ##, ###, ...)
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    // List item (bullet or ordered)
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      blocks.push({ kind: "bullet", text: bullet[1] });
      index += 1;
      continue;
    }

    const ordered = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (ordered) {
      flushParagraph();
      blocks.push({ kind: "ordered", marker: `${ordered[1]}.`, text: ordered[2] });
      index += 1;
      continue;
    }

    // Blockquote
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      blocks.push({ kind: "quote", text: quote[1] });
      index += 1;
      continue;
    }

    // Empty line separates paragraphs
    if (line.trim() === "") {
      flushParagraph();
      index += 1;
      continue;
    }

    paragraph.push(line);
    index += 1;
  }

  flushParagraph();
  return blocks;
}

export function CoachMarkdown({ text, position = "left", textStyle, linkStyle, onLinkPress }: CoachMarkdownProps) {
  const colors = useThemeColors();
  const scheme = useColorScheme();
  const isDark = scheme === "dark" || colors.onSurface === "#F0F2F5";
  const isIncoming = position !== "right";

  const textColor = isIncoming ? colors.onSurface : colors.onPrimary;
  const linkColor = isIncoming ? (isDark ? colors.primary : colors.pacingRest) : colors.onPrimary;
  const codeBg = isIncoming ? colors.surface : colors.surfaceAlt;
  const codeBorder = colors.outlineVariant;

  const blocks = useMemo(() => parseBlocks(text), [text]);

  return (
    <View style={styles.root}>
      {blocks.map((block, index) => {
        const keyBase = `blk-${index}`;

        if (block.kind === "heading") {
          const isH1 = block.level <= 1;
          const isH2 = block.level === 2;
          return (
            <Text
              key={keyBase}
              style={[
                styles.heading,
                isH1 ? styles.h1 : isH2 ? styles.h2 : styles.h3,
                { color: textColor },
                textStyle,
              ]}
            >
              {parseInline(block.text, keyBase, textColor, linkColor, codeBg, codeBorder, linkStyle, onLinkPress)}
            </Text>
          );
        }

        if (block.kind === "bullet" || block.kind === "ordered") {
          const marker = block.kind === "ordered" ? block.marker : "•";
          return (
            <View key={keyBase} style={styles.listItem}>
              <Text style={[styles.listMarker, { color: textColor }]}>{marker}</Text>
              <Text style={[styles.listText, { color: textColor }, textStyle]}>
                {parseInline(block.text, keyBase, textColor, linkColor, codeBg, codeBorder, linkStyle, onLinkPress)}
              </Text>
            </View>
          );
        }

        if (block.kind === "quote") {
          return (
            <View key={keyBase} style={[styles.quote, { borderLeftColor: isIncoming ? colors.outlineVariant : colors.onPrimary }]}>
              <Text style={[styles.quoteText, { color: textColor }, textStyle]}>
                {parseInline(block.text, keyBase, textColor, linkColor, codeBg, codeBorder, linkStyle, onLinkPress)}
              </Text>
            </View>
          );
        }

        if (block.kind === "code") {
          return (
            <ScrollView
              key={keyBase}
              horizontal
              style={[styles.codeScroll, { backgroundColor: codeBg, borderColor: codeBorder }]}
              contentContainerStyle={styles.codeContent}
              showsHorizontalScrollIndicator
            >
              <Text style={[styles.codeText, { color: textColor }, textStyle]}>
                {block.lines.join("\n")}
              </Text>
            </ScrollView>
          );
        }

        if (block.kind === "table") {
          const rows = block.lines.filter((_, row) => row !== 1).map(tableCells);
          return (
            <View
              key={keyBase}
              testID="coach-markdown-table-container"
              style={[styles.tableContainer, { borderColor: colors.outlineVariant, backgroundColor: colors.surface }]}
            >
              <ScrollView
                horizontal
                testID="coach-markdown-table-scroll"
                style={styles.tableScroll}
                contentContainerStyle={styles.tableContent}
                showsHorizontalScrollIndicator
              >
                <View style={styles.tableInner}>
                  {rows.map((row, rowIndex) => {
                    const isHeader = rowIndex === 0;
                    return (
                      <View
                        key={`row-${rowIndex}`}
                        testID="coach-markdown-table-row"
                        style={[
                          styles.tableRow,
                          {
                            backgroundColor: isHeader ? colors.surfaceVariant : colors.surface,
                            borderBottomColor: colors.outlineVariant,
                            borderBottomWidth: rowIndex < rows.length - 1 ? 1 : 0,
                          },
                        ]}
                      >
                        {row.map((cell, cellIndex) => (
                          <View
                            key={`cell-${cellIndex}`}
                            style={[
                              styles.tableCell,
                              {
                                borderRightColor: colors.outlineVariant,
                                borderRightWidth: cellIndex < row.length - 1 ? 1 : 0,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.tableCellText,
                                isHeader && styles.tableHeaderText,
                                {
                                  color: textColor,
                                },
                                textStyle,
                              ]}
                            >
                              {cell}
                            </Text>
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          );
        }

        return (
          <Text key={keyBase} style={[styles.paragraph, { color: textColor }, textStyle]}>
            {parseInline(block.text, keyBase, textColor, linkColor, codeBg, codeBorder, linkStyle, onLinkPress)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  paragraph: {
    fontSize: fontSizes.base,
    lineHeight: 22,
    marginBottom: spacing.xs,
  },
  bold: {
    fontWeight: "700",
  },
  italic: {
    fontStyle: "italic",
  },
  strike: {
    textDecorationLine: "line-through",
  },
  link: {
    textDecorationLine: "underline",
  },
  inlineCode: {
    fontFamily: MONO_FONT,
    fontSize: fontSizes.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  heading: {
    fontWeight: "700",
    marginVertical: spacing.xs,
  },
  h1: {
    fontSize: fontSizes.h1,
    lineHeight: 28,
  },
  h2: {
    fontSize: fontSizes.h2,
    lineHeight: 24,
  },
  h3: {
    fontSize: fontSizes.h3,
    lineHeight: 24,
  },
  listItem: {
    flexDirection: "row",
    marginBottom: spacing.xs,
    alignItems: "flex-start",
  },
  listMarker: {
    fontWeight: "600",
    fontSize: fontSizes.base,
    lineHeight: 22,
    marginRight: spacing.xs,
  },
  listText: {
    flex: 1,
    fontSize: fontSizes.base,
    lineHeight: 22,
  },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: spacing.sm,
    marginVertical: spacing.xs,
  },
  quoteText: {
    fontStyle: "italic",
    fontSize: fontSizes.base,
    lineHeight: 22,
  },
  codeScroll: {
    width: "100%",
    maxWidth: "100%",
    marginVertical: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  codeContent: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  codeText: {
    fontFamily: MONO_FONT,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  tableContainer: {
    width: "100%",
    maxWidth: "100%",
    marginVertical: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
    overflow: "hidden",
  },
  tableScroll: {
    width: "100%",
    maxWidth: "100%",
  },
  tableContent: {
    minWidth: "100%",
    width: "auto",
    flexGrow: 0,
  },
  tableInner: {
    minWidth: 500,
    width: "auto",
    alignSelf: "flex-start",
  },
  tableRow: {
    flexDirection: "row",
    minWidth: "100%",
  },
  tableCell: {
    minWidth: 100,
    flexShrink: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    justifyContent: "center",
  },
  tableCellText: {
    fontSize: fontSizes.sm,
    textAlign: "left",
  },
  tableHeaderText: {
    fontWeight: "700",
  },
});
