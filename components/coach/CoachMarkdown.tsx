import React, { useMemo } from "react";
import { Linking, Platform, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import type { Token, Tokens, TokensList } from "marked";
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

const MONO_FONT = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });
const TABLE_MIN_WIDTH = 500;
const TABLE_MIN_COLUMN_WIDTH = 100;
const TABLE_MAX_COLUMN_WIDTH = 260;
const TABLE_CHARACTER_WIDTH = 7;
const TABLE_CELL_HORIZONTAL_PADDING = spacing.sm * 2;

const estimatedTableTextWidth = (text: string) => Array.from(text).reduce(
  (width, character) => width + ((character.codePointAt(0) ?? 0) > 0xff ? TABLE_CHARACTER_WIDTH * 2 : TABLE_CHARACTER_WIDTH),
  TABLE_CELL_HORIZONTAL_PADDING,
);

type MarkedModule = typeof import("marked");
let markedModule: MarkedModule | null = null;

/**
 * Defer parser initialization until a Coach message is actually rendered.
 * Metro still includes JS dependencies in native bundles, but this avoids eager
 * evaluation and keeps the dependency boundary replaceable. The deliberately
 * small, zero-dependency `marked` lexer avoids shipping a full RN renderer.
 */
function lexMarkdown(text: string): TokensList {
  markedModule ??= require("marked") as MarkedModule;
  return markedModule.lexer(text, { gfm: true, breaks: false });
}

function isBreakHtml(text: string): boolean {
  return /^<br\s*\/?\s*>$/i.test(text.trim());
}

function plainTextFromTokens(tokens: Token[]): string {
  return tokens.map((token) => {
    if (token.type === "br" || (token.type === "html" && isBreakHtml(token.text))) return "\n";
    if (token.type === "image") return token.text;
    if ("tokens" in token && token.tokens) return plainTextFromTokens(token.tokens);
    return "text" in token ? String(token.text) : "";
  }).join("");
}

export function hasMarkdownTable(text: string): boolean {
  if (!text.includes("|")) return false;
  const containsTable = (tokens: Token[]): boolean => tokens.some((token) => {
    if (token.type === "table") return true;
    if (token.type === "list") {
      return (token as Tokens.List).items.some((item) => containsTable(item.tokens));
    }
    return "tokens" in token && Boolean(token.tokens) && containsTable(token.tokens ?? []);
  });
  return containsTable(lexMarkdown(text));
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

  const blocks = useMemo(() => lexMarkdown(text), [text]);

  const handleLink = (url: string) => {
    if (onLinkPress) onLinkPress(url);
    else Linking.openURL(url).catch(() => {});
  };

  // Token dispatch is intentionally centralized so every inline context shares identical Markdown behavior.
  // eslint-disable-next-line complexity
  const renderInline = (tokens: Token[], keyBase: string): React.ReactNode[] => tokens.map((token, index) => {
    const key = `${keyBase}.inline.${index}`;
    if (token.type === "text" || token.type === "escape") {
      const childTokens = "tokens" in token ? token.tokens : undefined;
      return token.type === "text" && childTokens
        ? <React.Fragment key={key}>{renderInline(childTokens, key)}</React.Fragment>
        : token.text;
    }
    if (token.type === "br" || (token.type === "html" && isBreakHtml(token.text))) return "\n";
    if (token.type === "strong") {
      return <Text key={key} style={[styles.bold, { color: textColor }]}>{renderInline(token.tokens ?? [], key)}</Text>;
    }
    if (token.type === "em") {
      return <Text key={key} style={[styles.italic, { color: textColor }]}>{renderInline(token.tokens ?? [], key)}</Text>;
    }
    if (token.type === "del") {
      return <Text key={key} style={[styles.strike, { color: textColor }]}>{renderInline(token.tokens ?? [], key)}</Text>;
    }
    if (token.type === "codespan") {
      return (
        <Text key={key} style={[styles.inlineCode, { color: textColor, backgroundColor: codeBg, borderColor: codeBorder }]}>
          {token.text}
        </Text>
      );
    }
    if (token.type === "link") {
      return (
        <Text key={key} style={[styles.link, { color: linkColor }, linkStyle]} onPress={() => handleLink(token.href)}>
          {renderInline(token.tokens ?? [], `${key}.label`)}
        </Text>
      );
    }
    if (token.type === "image") {
      return (
        <Text key={key} style={[styles.link, { color: linkColor }, linkStyle]} onPress={() => handleLink(token.href)}>
          {token.text || token.href}
        </Text>
      );
    }
    if (token.type === "html") return token.text.replace(/<[^>]*>/g, "");
    if (token.type === "checkbox") return null;
    if ("tokens" in token && token.tokens) return <React.Fragment key={key}>{renderInline(token.tokens, key)}</React.Fragment>;
    return null;
  });

  const renderList = (
    list: Tokens.List,
    keyBase: string,
    depth = 0,
    inheritedTextStyle?: StyleProp<TextStyle>,
  ): React.ReactNode => {
    const start = typeof list.start === "number" ? list.start : 1;
    return (
      <View key={keyBase} style={depth > 0 ? styles.nestedList : undefined}>
        {list.items.map((item, itemIndex) => {
          const itemKey = `${keyBase}.item.${itemIndex}`;
          const marker = list.ordered ? `${start + itemIndex}.` : "•";
          return (
            <View key={itemKey} style={styles.listItem}>
              {item.task ? (
                <View
                  testID={`coach-markdown-checkbox-${item.checked ? "checked" : "unchecked"}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: Boolean(item.checked), disabled: true }}
                  style={[
                    styles.taskCheckbox,
                    { borderColor: textColor, backgroundColor: item.checked ? textColor : "transparent" },
                  ]}
                >
                  {item.checked ? <Text style={[styles.taskCheckmark, { color: codeBg }]}>✓</Text> : null}
                </View>
              ) : (
                <Text style={[styles.listMarker, { color: textColor }]}>{marker}</Text>
              )}
              <View style={styles.listContent}>
                {item.tokens.map((token, tokenIndex) => {
                  const contentKey = `${itemKey}.content.${tokenIndex}`;
                  if (token.type === "list") {
                    return renderList(token as Tokens.List, contentKey, depth + 1, inheritedTextStyle);
                  }
                  if (token.type === "paragraph" || token.type === "text") {
                    const childTokens = "tokens" in token ? token.tokens : undefined;
                    return (
                      <Text key={contentKey} style={[styles.listText, { color: textColor }, inheritedTextStyle, textStyle]}>
                        {renderInline(childTokens ?? [token], contentKey)}
                      </Text>
                    );
                  }
                  return <React.Fragment key={contentKey}>{renderBlocks([token], contentKey, inheritedTextStyle)}</React.Fragment>;
                })}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  function renderBlocks(
    tokens: Token[],
    keyPrefix: string,
    inheritedTextStyle?: StyleProp<TextStyle>,
  ): React.ReactNode[] {
    // Block dispatch stays centralized to keep rendering and nested-list behavior consistent.
    // eslint-disable-next-line complexity
    return tokens.map((block, index) => {
    const keyBase = `${keyPrefix}-${index}`;

    if (block.type === "space" || block.type === "def") return null;
    if (block.type === "heading") {
          const isH1 = block.depth <= 1;
          const isH2 = block.depth === 2;
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
              {renderInline(block.tokens ?? [], keyBase)}
            </Text>
          );
        }

    if (block.type === "list") return renderList(block as Tokens.List, keyBase, 0, inheritedTextStyle);

    if (block.type === "blockquote") {
          return (
            <View key={keyBase} style={[styles.quote, { borderLeftColor: isIncoming ? colors.outlineVariant : colors.onPrimary }]}>
              {renderBlocks(block.tokens ?? [], `${keyBase}.quote`, [inheritedTextStyle, styles.quoteText])}
            </View>
          );
        }

    if (block.type === "code") {
          return (
            <ScrollView
              key={keyBase}
              horizontal
              style={[styles.codeScroll, { backgroundColor: codeBg, borderColor: codeBorder }]}
              contentContainerStyle={styles.codeContent}
              showsHorizontalScrollIndicator
            >
              <Text style={[styles.codeText, { color: textColor }, inheritedTextStyle, textStyle]}>
                {block.text}
              </Text>
            </ScrollView>
          );
        }

    if (block.type === "table") {
          const rows = [block.header, ...block.rows];
          const columnCount = Math.max(1, ...rows.map((row) => row.length));
          const columnWidths = Array.from({ length: columnCount }, (_, columnIndex) => {
            const contentWidth = Math.max(
              ...rows.map((row) => estimatedTableTextWidth(
                plainTextFromTokens(row[columnIndex]?.tokens ?? []),
              )),
            );
            return Math.max(
              TABLE_MIN_COLUMN_WIDTH,
              Math.ceil(TABLE_MIN_WIDTH / columnCount),
              Math.min(TABLE_MAX_COLUMN_WIDTH, contentWidth),
            );
          });
          const normalizedRows = rows.map((row) => Array.from(
            { length: columnCount },
            (_, columnIndex) => row[columnIndex] ?? { text: "", tokens: [], header: false, align: null },
          ));
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
                directionalLockEnabled
                keyboardShouldPersistTaps="handled"
              >
                <View style={[styles.tableInner, { width: columnWidths.reduce((total, width) => total + width, 0) }]}>
                  {normalizedRows.map((row, rowIndex) => {
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
                            testID={`coach-markdown-table-cell-${keyBase}-${cellIndex}`}
                            style={[
                              styles.tableCell,
                              { width: columnWidths[cellIndex] },
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
                                  textAlign: cell.align ?? "left",
                                },
                                inheritedTextStyle,
                                textStyle,
                              ]}
                            >
                              {renderInline(cell.tokens, `${keyBase}.cell.${rowIndex}.${cellIndex}`)}
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

    if (block.type === "hr") {
          return (
            <View
              key={keyBase}
              testID="coach-markdown-horizontal-rule"
              style={[styles.horizontalRule, { backgroundColor: colors.outlineVariant }]}
            />
          );
        }

    if (block.type === "html") {
          const value = block.text.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "");
          return value ? <Text key={keyBase} style={[styles.paragraph, { color: textColor }, inheritedTextStyle, textStyle]}>{value}</Text> : null;
        }

    if (block.type === "paragraph" || block.type === "text") {
          const childTokens = "tokens" in block ? block.tokens : undefined;
          const inlineTokens = block.type === "text" && !childTokens ? [block] : childTokens;
          return (
            <Text key={keyBase} style={[styles.paragraph, { color: textColor }, inheritedTextStyle, textStyle]}>
              {renderInline(inlineTokens ?? [], keyBase)}
            </Text>
          );
        }

    if ("tokens" in block && block.tokens) {
          return <React.Fragment key={keyBase}>{renderBlocks(block.tokens, `${keyBase}.children`, inheritedTextStyle)}</React.Fragment>;
        }

    return null;
    });
  }

  return (
    <View style={styles.root}>
      {renderBlocks(blocks, "blk")}
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
  listContent: {
    flex: 1,
    minWidth: 0,
  },
  nestedList: {
    marginTop: spacing.xs,
    paddingLeft: spacing.md,
  },
  taskCheckbox: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
    marginTop: spacing.xs,
  },
  taskCheckmark: {
    fontSize: fontSizes.sm,
    lineHeight: 14,
    fontWeight: "700",
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
  horizontalRule: {
    height: 1,
    marginVertical: spacing.sm,
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
    minWidth: TABLE_MIN_WIDTH,
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
