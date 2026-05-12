/**
 * BLD-1176 / AC #273: Grep-test verifying ADVANCED_SET_HELP_ENTRIES copy
 * contains none of the 17 locked psych/aspiration tokens.
 *
 * Banlist locked per BLD-1176 comment 91431813 + psych correction bfded462.
 * Each entry specifies the regex pattern, sample fails[], and sample passes[].
 */

import { ADVANCED_SET_HELP_ENTRIES, ADVANCED_SET_INTRO, ADVANCED_SET_FOOTER } from "../app/settings/advanced-sets";

// Flatten all text we need to scan: intro + titles + descriptions + examples + footer
const allCopy = [
  ADVANCED_SET_INTRO,
  ...ADVANCED_SET_HELP_ENTRIES.map((e) => {
    const ex = "example" in e ? String((e as Record<string, unknown>).example) : "";
    return `${e.title} ${e.description} ${ex}`;
  }),
  ADVANCED_SET_FOOTER,
].join("\n");

interface BanEntry {
  token: string;
  pattern: RegExp;
  fails: string[];
  passes: string[];
}

const BANLIST: BanEntry[] = [
  {
    token: "advanced lifters",
    pattern: /\badvanced lifters\b/i,
    fails: ["For advanced lifters only", "advanced lifters benefit most"],
    passes: ["For experienced trainees", "advanced training techniques"],
  },
  {
    token: "next level",
    pattern: /\bnext level\b/i,
    fails: ["Take your training to the next level", "next level gains"],
    passes: ["next progression step", "the following level of fatigue"],
  },
  {
    token: "unlock",
    pattern: /\bunlock\b/i,
    fails: ["unlock your potential", "unlock new gains"],
    passes: ["key technique", "allow access to more volume"],
  },
  {
    token: "serious lifters",
    pattern: /\bserious lifters\b/i,
    fails: ["serious lifters use this", "for serious lifters"],
    passes: ["consistent training", "committed athletes"],
  },
  {
    token: "take your training to",
    pattern: /\btake your training to\b/i,
    fails: ["take your training to the next level", "take your training to new heights"],
    passes: ["progress your training", "elevate your technique"],
  },
  {
    token: "crushed",
    pattern: /\bcrushed\b/i,
    fails: ["crushed it today", "muscles are crushed"],
    passes: ["fatigued", "thoroughly exhausted"],
  },
  {
    token: "beast",
    pattern: /\bbeast\b/i,
    fails: ["beast mode", "you are a beast"],
    passes: ["animal protein", "heavy compound lifts"],
  },
  {
    token: "legend",
    pattern: /\blegend/i,
    fails: ["become a legend", "legendary gains"],
    passes: ["long-standing technique", "established protocol"],
  },
  {
    token: "warrior",
    pattern: /\bwarrior/i,
    fails: ["warrior mindset", "true warriors train this way"],
    passes: ["competitive athletes", "persistent effort"],
  },
  {
    token: "dominate",
    pattern: /\bdominat/i,
    fails: ["dominate your competition", "dominating muscle fatigue"],
    passes: ["control fatigue", "manage volume"],
  },
  {
    token: "conquer",
    pattern: /\bconquer/i,
    fails: ["conquer the weight", "conquering fatigue"],
    passes: ["managing fatigue", "overcoming a plateau"],
  },
  {
    token: "slay",
    pattern: /\bslay/i,
    fails: ["slay your workout", "slaying sets"],
    passes: ["complete your sets", "finish each mini-set"],
  },
  {
    token: "grind",
    pattern: /\bgrind\b/i,
    fails: ["grind through the pain", "the daily grind"],
    passes: ["steady effort", "coffee grinder exercise"],
  },
  {
    token: "no excuses",
    pattern: /\bno excuses\b/i,
    fails: ["no excuses, just results", "no excuses attitude"],
    passes: ["no excessive load", "no exceptions to rest"],
  },
  {
    token: "earn",
    pattern: /\bearn\b/i,
    fails: ["earn your rest", "earn your gains"],
    passes: ["earnings aside", "easy earnings"],
  },
  {
    token: "deserve",
    pattern: /\bdeserv/i,
    fails: ["you deserve results", "deserving lifters"],
    passes: ["suitable for", "appropriate for"],
  },
  {
    token: "prove",
    pattern: /\bprove\b/i,
    fails: ["prove yourself", "prove you can do it"],
    passes: ["proven method", "well-proven technique"],
  },
];

describe("ADVANCED_SET_HELP_ENTRIES — copy tone (AC #273)", () => {
  it("ADVANCED_SET_HELP_ENTRIES is a non-empty array", () => {
    expect(Array.isArray(ADVANCED_SET_HELP_ENTRIES)).toBe(true);
    expect(ADVANCED_SET_HELP_ENTRIES.length).toBeGreaterThan(0);
  });

  it.each(BANLIST)("banned token «$token» is absent from help copy", ({ pattern, fails, passes }) => {
    // Verify the pattern actually catches the fail fixtures
    for (const sample of fails) {
      expect(pattern.test(sample)).toBe(true);
    }
    // Verify the pattern does NOT catch the pass fixtures
    for (const sample of passes) {
      expect(pattern.test(sample)).toBe(false);
    }
    // The actual check: production copy must not match
    expect(allCopy).not.toMatch(pattern);
  });
});
