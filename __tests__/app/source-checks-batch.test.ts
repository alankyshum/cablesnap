/**
 * Consolidated source-string structural tests (BLD-918).
 * Each describe block preserves original assertions and BLD issue references.
 */
/* eslint-disable max-lines */
import * as fs from "fs";
import * as path from "path";
import { CATEGORY_ICONS, semantic } from "../../constants/theme";

const root = path.resolve(__dirname, "../..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.resolve(root, rel), "utf-8");
}

// ── exercise-chip-styling (BLD-189) ──────────────────────────────

describe("Exercise category chip active/inactive styling (BLD-189)", () => {
  const exercisesSrc = readSrc("app/(tabs)/exercises.tsx");

  it("uses BNA Chip with correct active styling and icon colors", () => {
    expect(exercisesSrc).toContain('import { Chip } from "@/components/ui/chip"');
    expect(exercisesSrc).toContain(
      "active && { backgroundColor: colors.primaryContainer }"
    );
    expect(exercisesSrc).toContain("color: colors.onPrimaryContainer");
    expect(exercisesSrc).toContain(
      "color={active ? colors.onPrimaryContainer : colors.onSurface}"
    );
  });

  it("sets flexShrink: 0 on chip text to prevent ellipsis truncation", () => {
    expect(exercisesSrc).toContain("flexShrink: 0");
  });
});

// ── feedback-padding (BLD-177, BLD-204) ──────────────────────────

describe("feedback screen padding (BLD-177)", () => {
  const src = readSrc("app/feedback.tsx");

  it("FlashList contentContainerStyle includes styles.content with vertical padding", () => {
    expect(src).toContain(
      "contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}"
    );
    expect(src).toMatch(/content:\s*\{[^}]*padding:\s*16/);
    expect(src).toMatch(/content:\s*\{[^}]*paddingBottom:\s*40/);
    expect(src).not.toMatch(
      /contentContainerStyle=\{\{\s*paddingHorizontal/
    );
  });

  it("description Input uses type textarea with rows (BLD-204)", () => {
    expect(src).toMatch(/type="textarea"/);
    expect(src).toMatch(/rows=\{4\}/);
  });
});

// ── route-names ──────────────────────────────────────────────────

describe("Stack.Screen route names", () => {
  const layout = [
    readSrc("app/_layout.tsx"),
    readSrc("constants/screen-config.ts"),
  ].join("\n");
  const names = [
    ...layout.matchAll(/name:\s*"([^"]+)"/g),
    ...layout.matchAll(/name="([^"]+)"/g),
  ].map((m) => m[1]);
  const uniqueNames = [...new Set(names)];

  function exists(route: string): boolean {
    const base = path.join(root, "app", route);
    if (fs.existsSync(base + ".tsx")) return true;
    if (fs.existsSync(path.join(base, "_layout.tsx"))) return true;
    if (fs.existsSync(path.join(base, ".tsx"))) return true;
    if (fs.existsSync(base)) return fs.statSync(base).isFile();
    return false;
  }

  it("should have extracted route names from _layout.tsx", () => {
    expect(uniqueNames.length).toBeGreaterThan(0);
  });

  it("every route name maps to an existing file", () => {
    for (const name of uniqueNames) {
      if (!exists(name)) {
        throw new Error(`Route '${name}' does not map to an existing file under app/`);
      }
    }
  });
});

// ── session-swap-delete (BLD-307) ────────────────────────────────

describe("BLD-307: Long-press exercise delete (UI wiring)", () => {
  const sessionSrc = [
    readSrc("components/session/ExerciseGroupCard.tsx"),
    readSrc("components/session/GroupCardHeader.tsx"),
    readSrc("hooks/useExerciseManagement.ts"),
  ].join("\n");

  it("exercise name has onLongPress handler for delete", () => {
    const longPressMatches = sessionSrc.match(/onLongPress=\{.*onDeleteExercise/g);
    expect(longPressMatches).not.toBeNull();
    expect(longPressMatches!.length).toBeGreaterThanOrEqual(1);
  });

  it("has accessibility hint for long-press delete", () => {
    expect(sessionSrc).toContain("Long press to remove exercise");
  });

  it("shows countdown toast with UNDO action", () => {
    expect(sessionSrc).toMatch(/Removing \$\{group\.name\}\.\.\. \(\d+s\)/);
    expect(sessionSrc).toContain('label: "UNDO"');
  });

  it("provides haptic feedback and dismisses rest timer on delete", () => {
    expect(sessionSrc).toContain("Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)");
    expect(sessionSrc).toContain("dismissRest()");
  });
});

// ── previous-perf-fontsize-token (BLD-550, BLD-850) ──────────────

describe("LastNextRow uses design tokens (BLD-550, redirected to LastNextRow by BLD-850)", () => {
  const lastNextRowSrc = readSrc("components/session/LastNextRow.tsx");

  it("imports fontSizes from design-tokens", () => {
    expect(lastNextRowSrc).toMatch(
      /import\s*\{[^}]*fontSizes[^}]*\}\s*from\s*["'][^"']*design-tokens["']/,
    );
  });

  it("references fontSizes.xs (not the off-token 11)", () => {
    expect(lastNextRowSrc).toContain("fontSizes.xs");
    expect(lastNextRowSrc).not.toMatch(/fontSize:\s*11\b/);
  });

  it("each half meets the 44dp tap-target contract", () => {
    const halfBlock = lastNextRowSrc.match(/half:\s*\{[^}]+\}/s);
    expect(halfBlock).not.toBeNull();
    expect(halfBlock![0]).toMatch(/minHeight:\s*44\b/);
    const rowBlock = lastNextRowSrc.match(/row:\s*\{[^}]+\}/s);
    expect(rowBlock).not.toBeNull();
    expect(rowBlock![0]).toMatch(/minHeight:\s*44\b/);
  });
});

// ── session-keep-awake-lifecycle (BLD-577) ───────────────────────

describe("session screen keep-awake lifecycle (BLD-577)", () => {
  const source = readSrc("app/session/[id].tsx");

  it("imports both activateKeepAwakeAsync AND deactivateKeepAwake", () => {
    expect(source).toMatch(/activateKeepAwakeAsync/);
    expect(source).toMatch(/deactivateKeepAwake\b/);
  });

  it("calls activateKeepAwakeAsync() inside a useEffect", () => {
    expect(source).toMatch(/useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?activateKeepAwakeAsync/);
  });

  it("returns a cleanup function from that useEffect that calls deactivateKeepAwake", () => {
    const match = source.match(
      /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?activateKeepAwakeAsync[\s\S]*?return\s*\(\)\s*=>\s*\{[\s\S]*?deactivateKeepAwake\(\)[\s\S]*?\}[\s\S]*?\}\s*,\s*\[\s*\]\s*\)/,
    );
    expect(match).not.toBeNull();
  });
});

// ── program-flatlist-migration (BLD-422) ─────────────────────────

describe("program detail FlashList migration (BLD-422)", () => {
  const src = readSrc("app/program/[id].tsx");

  it("does not import FlashList", () => {
    expect(src).not.toMatch(/@shopify\/flash-list/);
  });

  it("imports FlatList from react-native", () => {
    expect(src).toMatch(/import\s*\{[^}]*FlatList[^}]*\}\s*from\s*["']react-native["']/);
  });

  it("uses FlatList component (not FlashList)", () => {
    expect(src).toMatch(/<FlatList[\s\n]/);
    expect(src).not.toMatch(/<FlashList[\s\n]/);
  });

  it("renders dayName text without explicit numberOfLines truncation", () => {
    const dayNameUsages = src.match(/dayName\(item\)/g);
    expect(dayNameUsages).not.toBeNull();
    const dayTextMatch = src.match(/Day \{index \+ 1\}:.*dayName/);
    expect(dayTextMatch).not.toBeNull();
    const textBlock = src.substring(
      src.indexOf("Day {index + 1}") - 100,
      src.indexOf("Day {index + 1}") + 100
    );
    expect(textBlock).not.toMatch(/numberOfLines/);
  });
});

// ── programme-padding-audit (BLD-190) ────────────────────────────

describe("programme padding audit (BLD-190)", () => {
  const auditedFiles = [
    { rel: "app/program/[id].tsx", label: "program detail" },
    { rel: "app/body/goals.tsx", label: "body goals" },
    { rel: "app/program/create.tsx", label: "create program" },
    { rel: "app/program/pick-template.tsx", label: "pick template" },
    { rel: "app/session/detail/[id].tsx", label: "session detail" },
    { rel: "app/session/summary/[id].tsx", label: "session summary" },
    { rel: "app/template/[id].tsx", label: "template detail" },
    { rel: "app/template/create.tsx", label: "create template" },
    { rel: "app/history.tsx", label: "history" },
  ];

  const sources = auditedFiles.map(({ rel, label }) => ({
    label,
    rel,
    src: readSrc(rel),
  }));

  describe.each(sources)("$label ($rel)", ({ src }) => {
    it("imports useLayout from lib/layout", () => {
      expect(src).toMatch(/import\s*\{[^}]*useLayout[^}]*\}\s*from\s*["'][^"']*lib\/layout["']/);
    });

    it("calls useLayout()", () => {
      expect(src).toContain("useLayout()");
    });

    it("uses layout.horizontalPadding in content container style", () => {
      expect(src).toContain("layout.horizontalPadding");
    });
  });

  it("program detail applies paddingHorizontal via contentContainerStyle", () => {
    const programSrc = sources.find((s) => s.rel === "app/program/[id].tsx")!.src;
    expect(programSrc).toContain("paddingHorizontal: layout.horizontalPadding");
  });
});

// ── exercise-header-alignment (BLD-390, BLD-850) ─────────────────

describe("exercise header alignment (BLD-390, updated by BLD-850)", () => {
  const groupCardHeaderSrc = readSrc("components/session/GroupCardHeader.tsx");
  const lastNextRowSrc = readSrc("components/session/LastNextRow.tsx");

  it("uses a `headerWrap` container with vertical gap so rows stack cleanly", () => {
    const block = groupCardHeaderSrc.match(/headerWrap:\s*\{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/gap:\s*\d+/);
  });

  it("`actionsRow` is the controls row — flexDirection row with center alignment + space-between", () => {
    const block = groupCardHeaderSrc.match(/actionsRow:\s*\{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/flexDirection:\s*["']row["']/);
    expect(block![0]).toMatch(/alignItems:\s*["']center["']/);
    expect(block![0]).toMatch(/justifyContent:\s*["']space-between["']/);
  });

  it("groupTitle has fontWeight 700 (visual emphasis preserved)", () => {
    const block = groupCardHeaderSrc.match(/groupTitle:\s*\{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/fontWeight:\s*["']700["']/);
  });

  it("progression-arrow signal (BLD-390) moved to LastNextRow for `increase` suggestions", () => {
    expect(lastNextRowSrc).toMatch(/arrow-up-bold/);
    expect(lastNextRowSrc).toMatch(/increase/);
  });
});

// ── feedback-share (BLD-72) ──────────────────────────────────────

describe("handleShare — shares text report as primary (BLD-72)", () => {
  const src = readSrc("app/feedback.tsx");

  function extractHandler(name: string): string {
    const pattern = new RegExp(
      `const ${name} = useCallback\\(async \\(\\) => \\{`
    );
    const match = src.match(pattern);
    if (!match || match.index === undefined) return "";
    let depth = 0;
    const start = match.index + match[0].length;
    for (let i = start; i < src.length; i++) {
      if (src[i] === "{") depth++;
      if (src[i] === "}") {
        if (depth === 0) return src.slice(match.index, i + 1);
        depth--;
      }
    }
    return "";
  }

  const handler = extractHandler("handleShare");

  it("handler exists and is non-empty", () => {
    expect(handler.length).toBeGreaterThan(0);
  });

  it("creates cablesnap-report.txt", () => {
    expect(handler).toContain('"cablesnap-report.txt"');
  });

  it("creates cablesnap-report.json as secondary artifact", () => {
    expect(handler).toContain('"cablesnap-report.json"');
  });

  it("creates text file before JSON file", () => {
    const txt = handler.indexOf('"cablesnap-report.txt"');
    const json = handler.indexOf('"cablesnap-report.json"');
    expect(txt).toBeLessThan(json);
  });

  it("shares the text report variable, not JSON artifact", () => {
    const share = handler.match(/Sharing\.shareAsync\((\w+)\.uri/);
    expect(share).toBeTruthy();
    expect(share![1]).toBe("report");
  });

  it("uses text/plain mimeType", () => {
    expect(handler).toContain('mimeType: "text/plain"');
    expect(handler).not.toContain('mimeType: "application/json"');
  });
});

// ── session-layout-fixes (BLD-293) ───────────────────────────────

describe("workout session layout fixes (BLD-293)", () => {
  const src = [
    readSrc("components/session/ExerciseGroupCard.tsx"),
    readSrc("components/session/ExerciseGroupSetTable.tsx"),
    readSrc("components/session/GroupCardHeader.tsx"),
    readSrc("components/session/SetRow.tsx"),
  ].join("\n");

  describe("Fix 1: Details button left alignment", () => {
    it("detailsBtn has marginLeft to align text with exercise name", () => {
      const match = src.match(/detailsBtn:\s*\{[^}]*marginLeft:\s*(-?\d+)/);
      expect(match).not.toBeNull();
      const margin = parseInt(match![1], 10);
      expect(margin).toBeLessThanOrEqual(-8);
      expect(margin).toBeGreaterThanOrEqual(-28);
    });
  });

  describe("Fix 2: Weight/Reps picker column spacing", () => {
    it("pickerCol has marginHorizontal of at least 12", () => {
      const match = src.match(/pickerCol:\s*\{[^}]*marginHorizontal:\s*(\d+)/);
      expect(match).not.toBeNull();
      const margin = parseInt(match![1], 10);
      expect(margin).toBeGreaterThanOrEqual(12);
    });

    it("colLabel marginHorizontal matches pickerCol spacing", () => {
      const pickerMatch = src.match(/pickerCol:\s*\{[^}]*marginHorizontal:\s*(\d+)/);
      const labelMatch = src.match(/colLabel:\s*\{[^}]*marginHorizontal:\s*(\d+)/);
      expect(pickerMatch).not.toBeNull();
      expect(labelMatch).not.toBeNull();
      expect(parseInt(labelMatch![1], 10)).toBe(parseInt(pickerMatch![1], 10));
    });
  });

  describe("Fix 3: SET/PREV header baseline alignment", () => {
    it("colSet style does NOT have minHeight (moved to inline on Pressable)", () => {
      const colSetBlock = src.match(/colSet:\s*\{[^}]*\}/);
      expect(colSetBlock).not.toBeNull();
      expect(colSetBlock![0]).not.toMatch(/minHeight/);
    });

    it("SetRow Pressable has minHeight: 36 inline for touch target", () => {
      expect(src).toMatch(/style=\{\[styles\.colSet,\s*\{\s*minHeight:\s*36\s*\}\]/);
    });

    it("headerRow has minHeight for consistent label alignment", () => {
      const match = src.match(/headerRow:\s*\{[^}]*minHeight:\s*(\d+)/);
      expect(match).not.toBeNull();
      expect(parseInt(match![1], 10)).toBeGreaterThanOrEqual(24);
    });
  });
});

// ── bottomsheet-workout-session (BLD-202) ────────────────────────

describe("workout session exercise detail BottomSheet (BLD-202)", () => {
  const src = [
    readSrc("app/session/[id].tsx"),
    readSrc("components/session/ExerciseDetailDrawer.tsx"),
    readSrc("hooks/useExerciseManagement.ts"),
  ].join("\n");

  it("imports BottomSheet from @gorhom/bottom-sheet", () => {
    expect(src).toMatch(
      /import\s+BottomSheet.*from\s+["']@gorhom\/bottom-sheet["']/
    );
  });

  it("imports BottomSheetFlatList from @gorhom/bottom-sheet", () => {
    expect(src).toContain("BottomSheetFlatList");
  });

  it("imports BottomSheetBackdrop from @gorhom/bottom-sheet", () => {
    expect(src).toContain("BottomSheetBackdrop");
  });

  it("does NOT import Modal from react-native", () => {
    expect(src).not.toMatch(/import\s*\{[^}]*Modal[^}]*\}\s*from\s*["']react-native["']/);
  });

  it("does NOT use <Modal component", () => {
    expect(src).not.toMatch(/<Modal[\s>]/);
  });

  it("creates a BottomSheet ref", () => {
    expect(src).toContain("useRef<BottomSheet>(null)");
  });

  it("defines snap points with 40% and 90%", () => {
    expect(src).toMatch(/["']40%["']/);
    expect(src).toMatch(/["']90%["']/);
  });

  it("uses enablePanDownToClose", () => {
    expect(src).toContain("enablePanDownToClose");
  });

  it("renders BottomSheetBackdrop with pressBehavior close", () => {
    expect(src).toContain('pressBehavior="close"');
  });

  it("uses BottomSheetFlatList for scrollable content", () => {
    expect(src).toMatch(/<BottomSheetFlatList/);
  });

  it("opens sheet via snapToIndex on detail show", () => {
    expect(src).toContain("snapToIndex(0)");
  });

  it("removes old detailOverlay style", () => {
    expect(src).not.toMatch(/detailOverlay\s*:/);
  });

  it("removes old detailDismiss style", () => {
    expect(src).not.toMatch(/detailDismiss\s*:/);
  });

  it("removes old detailSheet style with maxHeight 60%", () => {
    expect(src).not.toMatch(/detailSheet\s*:\s*\{[^}]*maxHeight/);
  });
});

// ── workout-header-overflow (BLD-203, BLD-390, BLD-850) ──────────

describe("Workout session exercise header three-row layout (BLD-203/BLD-390, redesigned in BLD-850)", () => {
  const groupCardHeaderSrc = readSrc("components/session/GroupCardHeader.tsx");
  const exerciseGroupCardSrc = readSrc("components/session/ExerciseGroupCard.tsx");
  const sessionSrc = exerciseGroupCardSrc + "\n" + groupCardHeaderSrc;

  it("uses a stacked header with `headerWrap` + `actionsRow`", () => {
    expect(groupCardHeaderSrc).toContain("headerWrap");
    expect(groupCardHeaderSrc).toContain("actionsRow");
  });

  it("`actionsRow` flex-wraps so swap/notes don't push Details off-screen", () => {
    const block = groupCardHeaderSrc.match(/actionsRow:\s*\{[^}]+\}/s);
    expect(block).not.toBeNull();
    expect(block![0]).toContain('flexDirection: "row"');
    expect(block![0]).toMatch(/flexWrap:\s*["']wrap["']/);
  });

  it("title row contains exercise name; controls row contains swap/notes/Details", () => {
    expect(groupCardHeaderSrc).toContain("styles.groupTitle");
    expect(groupCardHeaderSrc).toContain("Details");
    expect(groupCardHeaderSrc).toContain("swap-horizontal");
    expect(groupCardHeaderSrc).toContain("note-text");
  });

  it("training-mode selector is no longer rendered in the header (BLD-850)", () => {
    expect(groupCardHeaderSrc).not.toContain("TrainingModeSelector");
  });

  it("exercise-name Text does not use numberOfLines (long names wrap, never truncate)", () => {
    const groupTitleIdx = groupCardHeaderSrc.indexOf("styles.groupTitle");
    expect(groupTitleIdx).toBeGreaterThan(-1);
    const before = groupCardHeaderSrc.lastIndexOf("<Text", groupTitleIdx);
    const tag = groupCardHeaderSrc.slice(before, groupTitleIdx + 30);
    expect(tag).not.toContain("numberOfLines");
  });

  it("Last|Next row is its own row inside the header (BLD-850)", () => {
    expect(groupCardHeaderSrc).toContain("LastNextRow");
    expect(groupCardHeaderSrc).toMatch(/showLastNextRow/);
  });

  it("session source surface remains coherent", () => {
    expect(sessionSrc.length).toBeGreaterThan(0);
  });
});

// ── design-tokens-compliance ─────────────────────────────────────

describe("Design Token Compliance", () => {
  const COMPONENT_DIRS = [
    path.resolve(root, "components"),
    path.resolve(root, "app"),
  ];

  const EXCLUDED_FILES = [
    "design-tokens.ts",
    "theme.ts",
    "design-tokens-compliance.test.ts",
    "source-checks-batch.test.ts",
  ];

  function collectTsxFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") {
        results.push(...collectTsxFiles(full));
      } else if (/\.(tsx?|ts)$/.test(entry.name) && !EXCLUDED_FILES.includes(entry.name)) {
        results.push(full);
      }
    }
    return results;
  }

  const files = COMPONENT_DIRS.flatMap(collectTsxFiles);

  test("no borderRadius: 28 (should be radii.pill)", () => {
    const violations: string[] = [];
    for (const f of files) {
      const content = fs.readFileSync(f, "utf-8");
      if (/borderRadius:\s*28\b/.test(content)) {
        violations.push(path.relative(process.cwd(), f));
      }
    }
    expect(violations).toEqual([]);
  });

  test("no hardcoded modal overlay opacity other than 0.5", () => {
    const violations: string[] = [];
    const badOverlay = /rgba\(0\s*,\s*0\s*,\s*0\s*,\s*0\.(3|55|6)\)/;
    for (const f of files) {
      const content = fs.readFileSync(f, "utf-8");
      if (badOverlay.test(content)) {
        violations.push(path.relative(process.cwd(), f));
      }
    }
    expect(violations).toEqual([]);
  });

  test("no hardcoded #555 or #dfdfdf colors in components", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (!f.includes("components")) continue;
      const content = fs.readFileSync(f, "utf-8");
      if (/#555(?!\w)|#dfdfdf/i.test(content)) {
        violations.push(path.relative(process.cwd(), f));
      }
    }
    expect(violations).toEqual([]);
  });

  test("scrim token exists in design-tokens", () => {
    const tokens = readSrc("constants/design-tokens.ts");
    expect(tokens).toContain("export const scrim");
  });
});

// ── home-nested-buttons (BLD-69) ─────────────────────────────────

describe("Home screen — no nested buttons (BLD-69)", () => {
  const src = readSrc("app/(tabs)/index.tsx");

  it("does not import anything from react-native-paper", () => {
    const imports = src.match(/import\s*\{[^}]+\}\s*from\s*["']react-native-paper["']/s);
    expect(imports).toBeNull();
  });

  it("imports Button from BNA UI (not raw Pressable)", () => {
    const bnaImport = src.match(/import\s*\{[^}]+\}\s*from\s*["']@\/components\/ui\/button["']/s);
    expect(bnaImport).toBeTruthy();
    expect(bnaImport![0]).toContain("Button");
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

  it("does not use starterChip styles", () => {
    expect(src).not.toContain("styles.starterChip");
    expect(src).not.toContain("styles.starterChipText");
  });

  it("interactive elements use BNA UI components", () => {
    expect(src).toContain("Button");
    expect(src).not.toContain("<Chip");
  });
});

// ── web-unsupported-layout-gate (BLD-565) ────────────────────────

describe("RootLayout web-unsupported render gate (BLD-565)", () => {
  const layoutSrc = readSrc("app/_layout.tsx");

  it("destructures webUnsupported from useAppInit", () => {
    expect(layoutSrc).toMatch(/webUnsupported\s*[},]/);
  });

  it("imports WebUnsupportedScreen and WEB_UNSUPPORTED_MESSAGE", () => {
    expect(layoutSrc).toMatch(
      /from ['"](?:\.\.\/)?components\/WebUnsupportedScreen['"]/
    );
    expect(layoutSrc).toMatch(/WEB_UNSUPPORTED_MESSAGE/);
  });

  it("checks webUnsupported BEFORE rendering QueryProvider/Stack", () => {
    const gateIdx = layoutSrc.search(/if\s*\(\s*webUnsupported\s*\)/);
    const providerIdx = layoutSrc.indexOf("<QueryProvider");
    const stackIdx = layoutSrc.indexOf("<Stack");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(providerIdx).toBeGreaterThan(-1);
    expect(stackIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(providerIdx);
    expect(gateIdx).toBeLessThan(stackIdx);
  });

  it("the webUnsupported branch returns WebUnsupportedScreen and nothing from the drizzle-reachable tree", () => {
    const startIdx = layoutSrc.search(/if\s*\(\s*webUnsupported\s*\)\s*\{/);
    expect(startIdx).toBeGreaterThan(-1);
    const openBrace = layoutSrc.indexOf("{", startIdx);
    let depth = 0;
    let endIdx = openBrace;
    for (let i = openBrace; i < layoutSrc.length; i++) {
      if (layoutSrc[i] === "{") depth++;
      else if (layoutSrc[i] === "}") {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    const gateBlock = layoutSrc.slice(openBrace, endIdx + 1);
    expect(gateBlock).toMatch(/<WebUnsupportedScreen/);
    expect(gateBlock).not.toMatch(/<QueryProvider/);
    expect(gateBlock).not.toMatch(/<Stack\b/);
    expect(gateBlock).not.toMatch(/<LayoutBanners/);
  });
});

describe("LayoutBanners web-unsupported Retry suppression (BLD-565)", () => {
  const bannersSrc = readSrc("components/LayoutBanners.tsx");

  it("imports WEB_UNSUPPORTED_MESSAGE from lib/web-support", () => {
    expect(bannersSrc).toMatch(/WEB_UNSUPPORTED_MESSAGE/);
    expect(bannersSrc).toMatch(/from ['"]@\/lib\/web-support['"]/);
  });

  it("gates the Retry affordance on error !== WEB_UNSUPPORTED_MESSAGE", () => {
    expect(bannersSrc).toMatch(/error\s*!==\s*WEB_UNSUPPORTED_MESSAGE/);
    const match = bannersSrc.match(/>\s*Retry\s*</);
    expect(match).not.toBeNull();
    const retryIdx = match!.index!;
    const before = bannersSrc.slice(Math.max(0, retryIdx - 400), retryIdx);
    expect(before).toMatch(/&&\s*\(/);
  });
});

// ── floating-tab-bar (BLD-212) ───────────────────────────────────

describe("FloatingTabBar component (BLD-212)", () => {
  const floatingTabBarSrc = [
    readSrc("components/FloatingTabBar.tsx"),
    readSrc("components/floating-tab-bar/CenterButton.tsx"),
    readSrc("components/floating-tab-bar/TabButton.tsx"),
  ].join("\n");

  it("exports height constant, hook, and uses safe area insets", () => {
    expect(floatingTabBarSrc).toContain("export const FLOATING_TAB_BAR_HEIGHT");
    expect(floatingTabBarSrc).toContain("export function useFloatingTabBarHeight");
    expect(floatingTabBarSrc).toContain("useSafeAreaInsets");
    expect(floatingTabBarSrc).toContain("insets.bottom");
  });

  it("has floating design (absolute position, border radius, elevation/shadow)", () => {
    expect(floatingTabBarSrc).toMatch(/position:\s*['"]absolute['"]/);
    expect(floatingTabBarSrc).toContain("borderRadius");
    expect(floatingTabBarSrc).toContain("BAR_BORDER_RADIUS");
    expect(floatingTabBarSrc).toContain("elevation");
    expect(floatingTabBarSrc).toContain("shadowColor");
    expect(floatingTabBarSrc).toContain("shadowOffset");
    expect(floatingTabBarSrc).toContain("colors.");
    expect(floatingTabBarSrc).not.toContain('shadowColor: "#000"');
    expect(floatingTabBarSrc).not.toContain("shadowColor: '#000'");
  });

  it("uses theme-aware colors across multiple components", () => {
    const themeUsages = (floatingTabBarSrc.match(/const colors = useThemeColors\(\)/g) || []);
    expect(themeUsages.length).toBeGreaterThanOrEqual(2);
  });

  it("has accessible labels, touch targets, and font sizing", () => {
    expect(floatingTabBarSrc).toMatch(/label:[\s\S]*?fontSize:\s*fontSizes\.xs/);
    const lineHeightMatch = floatingTabBarSrc.match(/label:[\s\S]*?lineHeight:\s*(\d+)/);
    expect(lineHeightMatch).not.toBeNull();
    expect(Number(lineHeightMatch![1])).toBeGreaterThanOrEqual(16);
    expect(floatingTabBarSrc).toContain("CENTER_BUTTON_SIZE");
    expect(floatingTabBarSrc).toContain("borderRadius: CENTER_BUTTON_SIZE / 2");
    expect(floatingTabBarSrc).toContain('accessibilityRole="tab"');
    expect(floatingTabBarSrc).toContain('accessibilityLabel="Workouts"');
    expect(floatingTabBarSrc).toContain('accessibilityHint="Navigate to workout screen"');
    expect(floatingTabBarSrc).toContain("accessibilityState={{ selected:");
    const tabRoleCount = (floatingTabBarSrc.match(/accessibilityRole="tab"/g) || []).length;
    expect(tabRoleCount).toBeGreaterThanOrEqual(2);
    expect(floatingTabBarSrc).toContain("minWidth: 48");
    expect(floatingTabBarSrc).toContain("minHeight: 48");
  });

  it("handles keyboard events with animation support", () => {
    expect(floatingTabBarSrc).toContain("keyboardDidShow");
    expect(floatingTabBarSrc).toContain("keyboardDidHide");
    expect(floatingTabBarSrc).toContain("keyboardWillShow");
    expect(floatingTabBarSrc).toContain("keyboardWillHide");
    expect(floatingTabBarSrc).toContain("translateY");
    expect(floatingTabBarSrc).toContain("withTiming");
  });

  it("defines correct tab order (exercises, nutrition, index, progress, settings)", () => {
    const orderMatch = floatingTabBarSrc.match(/TAB_ORDER\s*=\s*\[([^\]]+)\]/);
    expect(orderMatch).not.toBeNull();
    const order = orderMatch![1].replace(/["'\s]/g, "").split(",");
    expect(order).toEqual(["exercises", "nutrition", "index", "progress", "settings"]);
  });
});

describe("Tab layout uses FloatingTabBar (BLD-212)", () => {
  const layoutSrc = readSrc("app/(tabs)/_layout.tsx");

  it("imports FloatingTabBar and passes it as tabBar prop", () => {
    expect(layoutSrc).toContain("FloatingTabBar");
    expect(layoutSrc).toContain("tabBar=");
  });

  it("defines all tab screens and avoids old tabBarStyle config", () => {
    expect(layoutSrc).toContain('name="exercises"');
    expect(layoutSrc).toContain('name="nutrition"');
    expect(layoutSrc).toContain('name="index"');
    expect(layoutSrc).toContain('name="progress"');
    expect(layoutSrc).toContain('name="settings"');
    expect(layoutSrc).not.toContain("tabBarActiveTintColor");
    expect(layoutSrc).not.toContain("tabBarInactiveTintColor");
    expect(layoutSrc).not.toContain("tabBarStyle");
  });
});

describe("Tab screens use useFloatingTabBarHeight (BLD-212)", () => {
  const screenEntries = [
    { label: "index.tsx", file: "app/(tabs)/index.tsx" },
    { label: "exercises.tsx", file: "app/(tabs)/exercises.tsx" },
    { label: "nutrition.tsx", file: "app/(tabs)/nutrition.tsx" },
    { label: "progress (WorkoutSegment)", file: "components/progress/WorkoutSegment.tsx" },
    { label: "settings.tsx", file: "app/(tabs)/settings.tsx" },
  ];

  it("all tab screens import useFloatingTabBarHeight and use tabBarHeight", () => {
    for (const { file } of screenEntries) {
      const src = readSrc(file);
      expect(src).toContain("useFloatingTabBarHeight");
      expect(src).toContain("tabBarHeight");
    }
  });
});

// ── no-nested-buttons (project-wide) ─────────────────────────────

describe("No nested <button> elements on web (project-wide)", () => {
  const APP_DIR = path.resolve(root, "app");
  const COMPONENTS_DIR = path.resolve(root, "components");

  function collectTsxFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectTsxFiles(full));
      } else if (entry.name.endsWith(".tsx")) {
        results.push(full);
      }
    }
    return results;
  }

  const allFiles = [...collectTsxFiles(APP_DIR), ...collectTsxFiles(COMPONENTS_DIR)];

  const filesWithTouchableRipple: { file: string; src: string }[] = [];
  for (const file of allFiles) {
    const src = fs.readFileSync(file, "utf-8");
    if (src.includes("TouchableRipple")) {
      filesWithTouchableRipple.push({ file, src });
    }
  }

  if (filesWithTouchableRipple.length > 0) {
    describe.each(filesWithTouchableRipple)(
      "TouchableRipple usage in $file",
      ({ file, src }) => {
        const relPath = path.relative(root, file);
        it(`${relPath}: TouchableRipple must not contain Chip, Button, IconButton, or FAB children`, () => {
          const lines = src.split("\n");
          let depth = 0;
          let start = -1;
          let block = "";
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.match(/<TouchableRipple\b/)) {
              start = i;
              block = "";
              depth = 1;
            }
            if (start >= 0 && depth > 0) {
              block += line + "\n";
              depth += (line.match(/<TouchableRipple\b/g) || []).length;
              depth -= (line.match(/<\/TouchableRipple>/g) || []).length;
              if (i === start) depth -= (line.match(/<TouchableRipple\b/g) || []).length - 1;
              if (depth <= 0) {
                const innerContent = block
                  .replace(/<TouchableRipple\b[^>]*>/, "")
                  .replace(/<\/TouchableRipple>/, "");
                const nestedButtons = innerContent.match(
                  /<(Chip|Button|IconButton|FAB|TouchableRipple)\b/g
                );
                expect(nestedButtons).toBeNull();
                start = -1;
                block = "";
              }
            }
          }
        });
      }
    );
  }

  describe("Pressable wrappers with interactive children", () => {
    for (const file of allFiles) {
      const src = fs.readFileSync(file, "utf-8");
      const relPath = path.relative(root, file);
      if (relPath.startsWith("components/ui/")) continue;
      if (!src.includes("<Pressable")) continue;
      it(`${relPath}: Pressable elements have accessibility attributes`, () => {
        const lines = src.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].match(/<Pressable\b/) && lines[i].includes("onPress")) {
            let tag = "";
            for (let j = i; j < Math.min(i + 20, lines.length); j++) {
              tag += lines[j] + "\n";
              if (lines[j].includes(">")) break;
            }
            const hasA11y = tag.includes("accessibilityRole") || tag.includes("accessibilityLabel");
            expect(hasA11y).toBe(true);
          }
        }
      });
    }
  });

  it("no screen file imports TouchableRipple with Chip in the same file", () => {
    const violations: string[] = [];
    for (const file of allFiles) {
      const src = fs.readFileSync(file, "utf-8");
      const relPath = path.relative(root, file);
      const importsTR = /TouchableRipple/.test(src);
      const importsChip = /<Chip[\s\n>]/.test(src);
      if (importsTR && importsChip) {
        const lines = src.split("\n");
        let inTR = false;
        let trDepth = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.match(/<TouchableRipple\b/)) {
            inTR = true;
            trDepth = 1;
          }
          if (inTR) {
            trDepth += (line.match(/<TouchableRipple\b/g) || []).length;
            trDepth -= (line.match(/<\/TouchableRipple>/g) || []).length;
            if (i === lines.indexOf(line) && line.match(/<TouchableRipple\b/)) {
              trDepth -= (line.match(/<TouchableRipple\b/g) || []).length - 1;
            }
            if (line.match(/<Chip\b/)) {
              violations.push(`${relPath}:${i + 1} — Chip nested inside TouchableRipple`);
            }
            if (trDepth <= 0) {
              inTR = false;
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

// ── visual-polish ────────────────────────────────────────────────

describe("CATEGORY_ICONS (constants/theme.ts)", () => {
  it("provides valid MaterialCommunityIcons name for every category", () => {
    const expectedIcons: Record<string, string> = {
      abs_core: "stomach",
      arms: "arm-flex",
      back: "human-handsup",
      chest: "weight-lifter",
      legs_glutes: "walk",
      shoulders: "account-arrow-up",
    };
    for (const [cat, icon] of Object.entries(expectedIcons)) {
      expect(CATEGORY_ICONS[cat]).toBeDefined();
      expect(typeof CATEGORY_ICONS[cat]).toBe("string");
      expect(CATEGORY_ICONS[cat]).toBe(icon);
    }
  });
});

describe("Home screen stats row", () => {
  const statsRowSrc = readSrc("components/home/StatsRow.tsx");
  const indexSrc = readSrc("app/(tabs)/index.tsx");

  it("renders stats row container with required icons and a11y labels", () => {
    expect(statsRowSrc).toContain("row");
    expect(statsRowSrc).toContain("stat");
    expect(statsRowSrc).toContain('"fire"');
    expect(statsRowSrc).toContain('"calendar-check"');
    expect(statsRowSrc).toContain('"trophy"');
    expect(statsRowSrc).toContain("week streak");
    expect(statsRowSrc).toContain("workouts this week");
    expect(statsRowSrc).toContain("recent personal records");
    expect(statsRowSrc).toContain("String(s.value)");
    expect(statsRowSrc).toContain("completedCount");
    expect(statsRowSrc).toContain("targetCount");
  });

  it("does NOT contain old streak or PR list cards on home", () => {
    expect(indexSrc).not.toContain("streakContent");
    expect(indexSrc).not.toContain("🔥 {streak}");
    expect(indexSrc).not.toContain("prCard");
    expect(indexSrc).not.toContain("prHeader");
    expect(indexSrc).not.toContain("Recent Personal Records");
  });
});

describe("Exercise list enhancements (exercises.tsx)", () => {
  const exercisesSrc = [
    readSrc("app/(tabs)/exercises.tsx"),
    readSrc("components/exercises/ExerciseCard.tsx"),
    readSrc("components/exercises/ExerciseDetailPane.tsx"),
  ].join("\n");

  it("supports custom filter type, label, badge and is_custom filter logic", () => {
    expect(exercisesSrc).toMatch(/FilterType\s*=.*"custom"/);
    expect(exercisesSrc).toContain('"custom"');
    expect(exercisesSrc).toContain("is_custom");
    expect(exercisesSrc).toContain('"Custom"');
    expect(exercisesSrc).toContain("customBadge");
    expect(exercisesSrc).toContain(">Custom<");
  });

  it("renders category icons on filter chips and difficulty colors with a11y", () => {
    expect(exercisesSrc).toContain("CATEGORY_ICONS");
    expect(exercisesSrc).toContain("CATEGORY_ICONS[f]");
    expect(exercisesSrc).toContain("DIFFICULTY_COLORS");
    expect(exercisesSrc).toContain("difficultyText");
    expect(exercisesSrc).toMatch(/Difficulty: \$\{diff\}/);
    expect(exercisesSrc).toContain('item.difficulty || "intermediate"');
  });

  it("avoids hardcoded text colors and uses font sizes >= 11 for interactive text", () => {
    const lines = exercisesSrc.split("\n");
    for (const line of lines) {
      if (line.includes("color:") && line.includes("Text")) {
        expect(line).not.toMatch(/#[0-9a-fA-F]{3,6}/);
      }
    }
    const matches = exercisesSrc.matchAll(/fontSize:\s*(\d+)/g);
    for (const m of matches) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(11);
    }
  });
});

describe("semantic difficulty colors", () => {
  it("has beginner, intermediate, advanced colors", () => {
    expect(semantic.beginner).toBeDefined();
    expect(semantic.intermediate).toBeDefined();
    expect(semantic.advanced).toBeDefined();
  });
});
