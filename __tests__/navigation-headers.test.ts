/**
 * BLD-1668 — Navigation header regression guard.
 *
 * Ensures that settings sub-screens that need a back button are registered in
 * SCREEN_CONFIGS with headerShown: true. Without this entry the root Stack
 * navigator defaults to headerShown: false and the header is invisible on web.
 */
import { SCREEN_CONFIGS } from "@/constants/screen-config";

function configFor(name: string) {
  return SCREEN_CONFIGS.find((c) => c.name === name);
}

describe("Settings sub-screens — navigation header registration", () => {
  const settingsScreensWithHeaders: Array<{ name: string; expectedTitle: string }> = [
    { name: "settings/advanced-sets", expectedTitle: "Advanced Set Types" },
    { name: "settings/gym-profiles", expectedTitle: "Gym Profiles" },
    { name: "settings/backups", expectedTitle: "Backups" },
    { name: "settings/macro-coach", expectedTitle: "Macro Coach" },
    { name: "settings/import-backup", expectedTitle: "Import Backup" },
  ];

  for (const { name, expectedTitle } of settingsScreensWithHeaders) {
    it(`${name} has headerShown: true`, () => {
      const config = configFor(name);
      expect(config).toBeDefined();
      expect(config?.options.headerShown).toBe(true);
    });

    it(`${name} has title "${expectedTitle}"`, () => {
      const config = configFor(name);
      expect(config?.options.title).toBe(expectedTitle);
    });
  }
});
