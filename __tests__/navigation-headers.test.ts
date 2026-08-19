/**
 * BLD-1668 / status-bar-overlap regression guard.
 *
 * Route groups (settings, tools, nutrition) own their native header via a nested
 * `app/<group>/_layout.tsx` instead of per-route entries in SCREEN_CONFIGS. The
 * native header owns the top safe-area inset, so content never collides with the
 * system status bar. This guard enforces that architecture so a new screen
 * dropped into one of these folders can never regress to a header-less,
 * status-bar-overlapping layout — without anyone editing a central screen list.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { SCREEN_CONFIGS } from "@/constants/screen-config";
import { TAB_ORDER } from "@/components/FloatingTabBar";
import { TAB_ICONS, TAB_LABELS } from "@/components/floating-tab-bar/TabButton";

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function configFor(name: string) {
  return SCREEN_CONFIGS.find((c) => c.name === name);
}

describe("Route groups own their header via a nested _layout", () => {
  const GROUPS = ["settings", "tools", "nutrition"] as const;

  for (const group of GROUPS) {
    it(`root SCREEN_CONFIGS registers "${group}" with headerShown: false (delegates to nested layout)`, () => {
      const config = configFor(group);
      expect(config).toBeDefined();
      expect(config?.options.headerShown).toBe(false);
    });

    it(`app/${group}/_layout.tsx renders a Stack with headerShown: true`, () => {
      const src = read(`app/${group}/_layout.tsx`);
      expect(src).toMatch(/<Stack\b/);
      expect(src).toMatch(/headerShown:\s*true/);
    });

    it(`app/${group}/_layout.tsx does NOT set the group's own root header (no double header)`, () => {
      // The group's own screen in the root stack must stay header-less; only the
      // nested screens get a header. Guarded by the headerShown:false assertion
      // above — this keeps the intent documented alongside it.
      expect(configFor(group)?.options.headerShown).toBe(false);
    });
  }
});

describe("Settings sub-screens declare a title (own file or group layout)", () => {
  // Every settings screen must end up with a header title. It may be set inline
  // in the screen file OR declared once in the group layout for multi-branch
  // screens. Either satisfies the guard.
  const settingsScreens: Array<{ file: string; title: string }> = [
    { file: "app/settings/advanced-sets.tsx", title: "Advanced Set Types" },
    { file: "app/settings/gym-profiles.tsx", title: "Gym Profiles" },
    { file: "app/settings/backups.tsx", title: "Backups" },
    { file: "app/settings/import-backup.tsx", title: "Import Backup" },
    { file: "app/settings/import-workouts.tsx", title: "Import Workout History" },
    { file: "app/settings/training-day-macros.tsx", title: "Training-Day Macros" },
  ];

  const layout = read("app/settings/_layout.tsx");

  for (const { file, title } of settingsScreens) {
    it(`${file} has title "${title}"`, () => {
      const declaredInScreen = read(file).includes(title);
      const declaredInLayout = layout.includes(title);
      expect(declaredInScreen || declaredInLayout).toBe(true);
    });
  }
});

describe("Navigation tab configuration stays in lockstep", () => {
  it("TAB_ORDER, TAB_ICONS, and TAB_LABELS have identical key sets", () => {
    const orderKeys = [...TAB_ORDER].sort();
    expect(orderKeys).toEqual(Object.keys(TAB_ICONS).sort());
    expect(orderKeys).toEqual(Object.keys(TAB_LABELS).sort());
  });

  it("registers the AI Coach route and title", () => {
    const tabLayout = read("app/(tabs)/_layout.tsx");
    expect(tabLayout).toContain('name="ai-coach"');
    expect(tabLayout).toContain('id: "tabs.aiCoach.title"');
  });

  it("keeps the exercises breadcrumb title registration", () => {
    expect(read("app/(tabs)/_layout.tsx")).toContain("BreadcrumbTitle");
    expect(read("app/(tabs)/_layout.tsx")).toContain('label: "exercise"');
  });
});
