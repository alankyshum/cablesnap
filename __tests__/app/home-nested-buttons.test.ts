import * as fs from "fs";
import * as path from "path";

/**
 * Structural tests for BLD-69: no nested <button> elements on web.
 *
 * react-native-paper Chip renders as <button> on web even without onPress.
 * Cards with onPress render as <button>. Nesting causes hydration errors.
 *
 * Verifies: Chip replaced with View+Text badges, Cards with interactive
 * children use Pressable instead of Card onPress.
 */

const src = fs.readFileSync(
  path.resolve(__dirname, "../../app/(tabs)/index.tsx"),
  "utf-8"
);

describe("Home screen — no nested buttons (BLD-69)", () => {
  it("does not import Chip from react-native-paper", () => {
    const imports = src.match(/import\s*\{[^}]+\}\s*from\s*["']react-native-paper["']/s);
    expect(imports).toBeTruthy();
    expect(imports![0]).not.toContain("Chip");
  });

  it("imports Pressable from react-native", () => {
    const imports = src.match(/import\s*\{[^}]+\}\s*from\s*["']react-native["']/s);
    expect(imports).toBeTruthy();
    expect(imports![0]).toContain("Pressable");
  });

  it("does not use Chip component anywhere", () => {
    const body = src.replace(/import\s*\{[^}]+\}\s*from\s*["'][^"']+["']/gs, "");
    expect(body).not.toMatch(/<Chip[\s>]/);
  });

  it("Cards with IconButton children do not have onPress", () => {
    const lines = src.split("\n");
    let depth = 0;
    let start = -1;
    let props = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/<Card\b/) && !line.match(/<Card\./)) {
        start = i;
        props = "";
        depth = 1;
      }
      if (start >= 0 && depth > 0) {
        props += line + "\n";
        const opens = (line.match(/<Card\b/g) || []).length;
        const closes = (line.match(/<\/Card>/g) || []).length;
        depth += opens - closes;
        if (i === start) depth -= opens - 1;

        if (depth <= 0) {
          if (props.includes("IconButton") || props.includes("Menu")) {
            const tag = props.match(/<Card\b[^>]*>/s);
            if (tag) {
              expect(tag[0]).not.toMatch(/onPress/);
            }
          }
          start = -1;
          props = "";
        }
      }
    }
  });

  it("uses badge styles instead of starterChip", () => {
    expect(src).toContain("styles.badge");
    expect(src).toContain("styles.badgeText");
    expect(src).not.toContain("styles.starterChip");
    expect(src).not.toContain("styles.starterChipText");
  });

  it("badge style has no hardcoded hex colors", () => {
    const match = src.match(/badge:\s*\{[^}]+\}/);
    if (match) {
      expect(match[0]).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }
  });

  it("Pressable wrappers have accessibilityRole button", () => {
    const lines = src.split("\n");
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/<Pressable\b/)) {
        count++;
        let block = "";
        for (let j = i; j < Math.min(i + 15, lines.length); j++) {
          block += lines[j] + "\n";
          if (lines[j].trim() === ">" || lines[j].match(/\w>\s*$/)) break;
        }
        expect(block).toContain('accessibilityRole="button"');
      }
    }
    expect(count).toBeGreaterThan(0);
  });

  it("Pressable wrappers have accessibilityLabel", () => {
    const lines = src.split("\n");
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/<Pressable\b/)) {
        count++;
        let block = "";
        for (let j = i; j < Math.min(i + 15, lines.length); j++) {
          block += lines[j] + "\n";
          if (lines[j].trim() === ">" || lines[j].match(/\w>\s*$/)) break;
        }
        expect(block).toContain("accessibilityLabel");
      }
    }
    expect(count).toBeGreaterThan(0);
  });
});
