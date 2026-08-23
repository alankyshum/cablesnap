import React, { createElement, useMemo } from "react";
import { Platform, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import { BasicMarkdown } from "@kesha-antonov/react-native-chat";
import { radii, spacing } from "@/constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

type Props = {
  text: string;
  textStyle?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  onLinkPress?: (url: string) => void;
};

type Block = { kind: "markdown" | "code" | "table"; lines: string[] };

const isDivider = (line: string) => {
  const values = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
  return values.length > 0 && values.every((value) => /^\s*:?-{3,}:?\s*$/.test(value));
};

const tableCells = (line: string) =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, "|").trim());

function splitBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let markdown: string[] = [];
  const flush = () => {
    if (markdown.length > 0) {
      blocks.push({ kind: "markdown", lines: markdown });
      markdown = [];
    }
  };

  for (let index = 0; index < lines.length;) {
    if (/^\s*```/.test(lines[index])) {
      flush();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", lines: code });
      continue;
    }
    if (index + 1 < lines.length && lines[index].includes("|") && isDivider(lines[index + 1])) {
      flush();
      const table = [lines[index], lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim() !== "") table.push(lines[index++]);
      blocks.push({ kind: "table", lines: table });
      continue;
    }
    markdown.push(lines[index++]);
  }
  flush();
  return blocks;
}

export function CoachMarkdown({ text, textStyle, linkStyle, onLinkPress }: Props) {
  const colors = useThemeColors();
  const blocks = useMemo(() => splitBlocks(text), [text]);

  return (
    <View style={styles.root}>
      {blocks.map((block, index) => {
        if (block.kind === "code") {
          return (
            <ScrollView key={`code-${index}`} horizontal style={[styles.codeScroll, { backgroundColor: colors.surfaceVariant }]} contentContainerStyle={styles.codeContent} showsHorizontalScrollIndicator>
              <Text style={[textStyle, styles.codeText, { color: colors.onSurface }]}>{block.lines.join("\n")}</Text>
            </ScrollView>
          );
        }
        if (block.kind === "table") {
          const rows = block.lines.filter((_, row) => row !== 1).map(tableCells);
          const webTable = Platform.OS === "web" ? createElement(
            "table",
            { style: { borderCollapse: "collapse", minWidth: "100%" } },
            createElement("tbody", null, rows.map((row, rowIndex) => createElement(
              "tr",
              { key: `row-${rowIndex}`, style: { backgroundColor: rowIndex === 0 ? colors.surfaceVariant : colors.surface } },
              row.map((cell, cellIndex) => createElement(rowIndex === 0 ? "th" : "td", {
                key: `cell-${cellIndex}`,
                style: { color: colors.onSurface, border: `1px solid ${colors.outlineVariant}`, padding: spacing.xs, textAlign: "left" },
              }, cell)),
            ))),
          ) : null;
          return (
            <ScrollView key={`table-${index}`} horizontal style={styles.tableScroll} contentContainerStyle={styles.tableContent} showsHorizontalScrollIndicator>
              {webTable ?? <View style={[styles.table, { borderColor: colors.outlineVariant }]}> 
                {rows.map((row, rowIndex) => (
                  <View key={`row-${rowIndex}`} testID="coach-markdown-table-row" style={[styles.tableRow, { backgroundColor: rowIndex === 0 ? colors.surfaceVariant : colors.surface, borderBottomColor: colors.outlineVariant }]}>
                    {row.map((cell, cellIndex) => <Text key={`cell-${cellIndex}`} style={[textStyle, styles.tableCell, rowIndex === 0 && styles.tableHeader, { color: colors.onSurface, borderRightColor: colors.outlineVariant }]}>{cell}</Text>)}
                  </View>
                ))}
              </View>}
            </ScrollView>
          );
        }
        // Keep the library renderer for every existing construct. H3+ maps to H2
        // so it gains hierarchy without making the compact chat typography loud.
        return <BasicMarkdown key={`markdown-${index}`} text={block.lines.join("\n").replace(/^(#{3,6})\s+/gm, "## ")} textStyle={textStyle} linkStyle={linkStyle} onLinkPress={onLinkPress} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: "100%" },
  codeScroll: { maxWidth: "100%", marginVertical: spacing.xs, borderRadius: radii.sm },
  codeContent: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  codeText: { fontFamily: "monospace" },
  tableScroll: { maxWidth: "100%", marginVertical: spacing.xs },
  tableContent: { minWidth: "100%" },
  table: { borderWidth: 1, borderRadius: radii.sm, overflow: "hidden" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1 },
  tableCell: { minWidth: 72, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRightWidth: 1 },
  tableHeader: { fontWeight: "700" },
});
