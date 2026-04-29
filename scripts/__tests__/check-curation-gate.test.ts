/**
 * BLD-743 — Tests for the deterministic curation gate.
 *
 * QD requested (comment e053f1d5) before wiring to pre-push:
 *   "a unit test with 3-4 fixture panel outputs (one with safety
 *    concerns, one without, one with formatting variation) before
 *    wiring to pre-push"
 *
 * Updated for severity tiering (CEO ruling 0e827b56, QD spec 50965182):
 *   `SafetyClass = SAFETY_HIGH | SAFETY_LOW | REFINEMENT | N/A`.
 *
 * These tests cover:
 *   - `extractSafetySection()` — robust parsing across panel Markdown
 *     variations (plain, ###, **bold**, with-colon, missing).
 *   - `classifySafety()` — full tier truth table including the
 *     CEO/QD-mandated edge fixtures: `LOW to MEDIUM` → SAFETY_HIGH,
 *     `NONE–LOW` (em-dash) → SAFETY_LOW.
 *   - `gateBlocks()` — severity-aware truth table from QD comment
 *     50965182: only `AWC + SAFETY_HIGH` (and AWC + N/A fail-closed)
 *     blocks; `AWC + SAFETY_LOW` and `AWC + REFINEMENT` PASS.
 *   - `parseCurationBlocks()` — recovery of round + verdict +
 *     safety-class from rendered CURATION.md, plus legacy `SAFETY`
 *     token backwards-compat (treated as SAFETY_HIGH, fail-closed).
 */
import {
  classifySafety,
  extractSafetySection,
  gateBlocks,
  type SafetyClass,
} from "../curate-exercise-images";
import { parseCurationBlocks } from "../check-curation-gate";

describe("extractSafetySection", () => {
  it("returns empty string when the section is missing", () => {
    expect(
      extractSafetySection(
        "Scientific Accuracy\n- foo\n\nVerdict\nAPPROVE\n",
      ),
    ).toBe("");
  });

  it("extracts the section under a plain heading", () => {
    const panel = [
      "Scientific Accuracy",
      "- a",
      "",
      "Safety Concerns",
      "- Item one: LOW",
      "- Item two: MEDIUM",
      "",
      "Evidence-Based Recommendations",
      "- ignore me",
    ].join("\n");
    const sec = extractSafetySection(panel);
    expect(sec).toContain("Item one: LOW");
    expect(sec).toContain("Item two: MEDIUM");
    expect(sec).not.toContain("ignore me");
  });

  it("extracts under a Markdown heading (## Safety Concerns)", () => {
    const panel = [
      "## Scientific Accuracy",
      "ok",
      "",
      "## Safety Concerns",
      "- knee shear: HIGH",
      "",
      "## Verdict",
      "REJECT",
    ].join("\n");
    expect(extractSafetySection(panel)).toContain("knee shear: HIGH");
  });

  it("extracts under a colon-suffixed heading (Safety Concerns:)", () => {
    const panel = [
      "Scientific Accuracy",
      "x",
      "",
      "Safety Concerns:",
      "- mild ache: LOW",
      "",
      "Engagement Psychology Assessment",
      "ignore",
    ].join("\n");
    expect(extractSafetySection(panel)).toContain("mild ache: LOW");
  });

  it("stops cleanly at the next major section even without ## prefix", () => {
    const panel = [
      "Safety Concerns",
      "- A: LOW",
      "",
      "Evidence-Based Recommendations",
      "- recommend X",
    ].join("\n");
    const sec = extractSafetySection(panel);
    expect(sec).toBe("- A: LOW");
  });
});

describe("classifySafety (severity tiering)", () => {
  it("returns N/A when the section is absent", () => {
    expect(classifySafety("no safety section here\nVerdict\nAPPROVE\n")).toBe(
      "N/A",
    );
  });

  it("returns REFINEMENT when section is present but lists no risks and no ratings", () => {
    const panel = [
      "Safety Concerns",
      "- The form cues are clear and the start/end checkpoints are well defined.",
      "- Tempo guidance is appropriate for a novice.",
      "",
      "Verdict",
      "APPROVE_WITH_CHANGES",
    ].join("\n");
    expect(classifySafety(panel)).toBe("REFINEMENT");
  });

  it("returns SAFETY_LOW when a keyword is present without explicit rating", () => {
    // "avoid" is in SAFETY_KEYWORDS — fail-closed at LOW (was SAFETY in
    // the binary classifier; the new tier is the *minimum* "real" risk).
    const panel = [
      "Safety Concerns",
      "- Recommend smoother phrasing to avoid implying a deadlift cue.",
      "",
      "Verdict",
      "APPROVE_WITH_CHANGES",
    ].join("\n");
    expect(classifySafety(panel)).toBe("SAFETY_LOW");
  });

  it("returns SAFETY_LOW when only a LOW rating is present", () => {
    const panel = [
      "Safety Concerns",
      "- LOW: minor cue tightening recommended; no acute risk.",
      "",
      "Verdict",
      "APPROVE_WITH_CHANGES",
    ].join("\n");
    expect(classifySafety(panel)).toBe("SAFETY_LOW");
  });

  it("returns SAFETY_HIGH for a MEDIUM rating", () => {
    const panel = [
      "Safety Concerns",
      "- MEDIUM concern: knee tracking deviates from the foot under loaded eccentric.",
      "",
      "Verdict",
      "APPROVE_WITH_CHANGES",
    ].join("\n");
    expect(classifySafety(panel)).toBe("SAFETY_HIGH");
  });

  it("returns SAFETY_HIGH for a HIGH rating", () => {
    const panel = [
      "Safety Concerns",
      "- HIGH: lumbar shear risk under load.",
      "",
    ].join("\n");
    expect(classifySafety(panel)).toBe("SAFETY_HIGH");
  });

  it("returns SAFETY_HIGH for a CRITICAL rating", () => {
    const panel = [
      "Safety Concerns",
      "- CRITICAL: cable-strike trajectory toward face.",
      "",
    ].join("\n");
    expect(classifySafety(panel)).toBe("SAFETY_HIGH");
  });

  it("returns SAFETY_HIGH for `LOW to MEDIUM` (range straddling the threshold)", () => {
    // CEO/QD edge fixture (comments 0e827b56, 50965182): the bare word
    // `MEDIUM` is present, so the panel is signalling the upper bound
    // is non-trivial. Fail-closed at SAFETY_HIGH.
    const panel = [
      "Safety Concerns",
      "- Severity: LOW to MEDIUM. Repeated overhead reps may aggravate pre-existing impingement.",
      "",
      "Verdict",
      "APPROVE_WITH_CHANGES",
    ].join("\n");
    expect(classifySafety(panel)).toBe("SAFETY_HIGH");
  });

  it("returns SAFETY_LOW for `NONE–LOW` (em-dash range below the threshold)", () => {
    // CEO/QD edge fixture: only LOW is the upper bound — should classify
    // as SAFETY_LOW (allowed through the gate as ship-with-coaching-note).
    const panel = [
      "Safety Concerns",
      "- Severity: NONE–LOW. Mild discomfort possible if cable path crosses torso; cue path away from body.",
      "",
      "Verdict",
      "APPROVE_WITH_CHANGES",
    ].join("\n");
    expect(classifySafety(panel)).toBe("SAFETY_LOW");
  });

  it("does NOT trip on a bare `Severity: NONE` line (no keywords, no risk)", () => {
    const panel = [
      "Safety Concerns",
      "- Severity: NONE. Cues are well-bounded and the breath cadence is appropriate.",
      "",
      "Verdict",
      "APPROVE",
    ].join("\n");
    expect(classifySafety(panel)).toBe("REFINEMENT");
  });

  it("upgrades from SAFETY_LOW to SAFETY_HIGH when MEDIUM appears anywhere in the section", () => {
    // Even if the panel mostly described a LOW issue, a single MEDIUM
    // mention (e.g., a secondary concern) should escalate to SAFETY_HIGH.
    const panel = [
      "Safety Concerns",
      "- Issue 1 (LOW): mild lat fatigue.",
      "- Issue 2 (MEDIUM): rotator cuff impingement risk on overhead lockout.",
      "",
    ].join("\n");
    expect(classifySafety(panel)).toBe("SAFETY_HIGH");
  });

  it("does NOT false-positive SAFETY_HIGH on lowercase prose words like `too high`/`too low`", () => {
    // Regression: voltra-029 round-2 (BLD-743). Panel said "finishing
    // too high" in prose, with all severities rated LOW. Case-sensitive
    // matching against the prompt's uppercase grammar prevents the
    // word `high` (in "too high") from escalating to SAFETY_HIGH.
    const panel = [
      "Safety Concerns",
      "- Anterior shoulder/AC stress from excessive crossing or finishing too high: LOW.",
      "- Mild discomfort if hand drifts too low under load: LOW.",
      "",
      "Verdict",
      "APPROVE_WITH_CHANGES",
    ].join("\n");
    expect(classifySafety(panel)).toBe("SAFETY_LOW");
  });
});

describe("gateBlocks (severity-tiered truth table)", () => {
  // Truth table from QD comment 50965182 (ratified by CEO 0e827b56).
  //   blocking iff:
  //     - verdict ∈ {REJECT, NEEDS_RESEARCH, UNKNOWN}, OR
  //     - verdict = APPROVE_WITH_CHANGES AND safetyClass ∈ {SAFETY_HIGH, N/A}
  const cases: Array<[string, SafetyClass, boolean]> = [
    // APPROVE — never blocks regardless of class.
    ["APPROVE", "N/A", false],
    ["APPROVE", "REFINEMENT", false],
    ["APPROVE", "SAFETY_LOW", false],
    ["APPROVE", "SAFETY_HIGH", false],

    // APPROVE_WITH_CHANGES — gated by severity tier.
    ["APPROVE_WITH_CHANGES", "REFINEMENT", false],
    ["APPROVE_WITH_CHANGES", "SAFETY_LOW", false], // ship with coaching note
    ["APPROVE_WITH_CHANGES", "SAFETY_HIGH", true],
    ["APPROVE_WITH_CHANGES", "N/A", true], // fail-closed

    // Hard verdicts — always block.
    ["NEEDS_RESEARCH", "REFINEMENT", true],
    ["NEEDS_RESEARCH", "SAFETY_LOW", true],
    ["NEEDS_RESEARCH", "SAFETY_HIGH", true],
    ["REJECT", "REFINEMENT", true],
    ["REJECT", "SAFETY_HIGH", true],
    ["UNKNOWN", "REFINEMENT", true],
    ["UNKNOWN", "SAFETY_LOW", true],
  ];
  it.each(cases)(
    "verdict=%s safety=%s → blocks=%s",
    (verdict, safety, expected) => {
      expect(gateBlocks(verdict, safety)).toBe(expected);
    },
  );

  it("is case-insensitive on the verdict token", () => {
    expect(gateBlocks("approve_with_changes", "REFINEMENT")).toBe(false);
    expect(gateBlocks("approve_with_changes", "SAFETY_LOW")).toBe(false);
    expect(gateBlocks("approve_with_changes", "SAFETY_HIGH")).toBe(true);
  });
});

describe("parseCurationBlocks", () => {
  const sample = [
    "# Curation",
    "_preamble_",
    "",
    "## voltra-001 — Foo",
    "- Round: **2**",
    "- Curation gate: ✅ PASS (verdict=`APPROVE`, safety-class=`REFINEMENT` — `gateBlocks()`)",
    "- Visual plausibility: ✅ x",
    "",
    "## voltra-013 — Bar",
    "- Round: **2**",
    "- Curation gate: ❌ BLOCK (verdict=`APPROVE_WITH_CHANGES`, safety-class=`SAFETY_HIGH` — `gateBlocks()`)",
    "- Visual: ok",
    "",
    "## voltra-020 — Baz",
    "- Round: **2**",
    "- Curation gate: ✅ PASS (verdict=`APPROVE_WITH_CHANGES`, safety-class=`SAFETY_LOW` — `gateBlocks()`)",
    "- Visual: ok",
    "",
  ].join("\n");

  it("recovers id, round, verdict, and safety-class for each block", () => {
    const blocks = parseCurationBlocks(sample);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({
      id: "voltra-001",
      round: 2,
      verdict: "APPROVE",
      safetyClass: "REFINEMENT",
    });
    expect(blocks[1]).toEqual({
      id: "voltra-013",
      round: 2,
      verdict: "APPROVE_WITH_CHANGES",
      safetyClass: "SAFETY_HIGH",
    });
    expect(blocks[2]).toEqual({
      id: "voltra-020",
      round: 2,
      verdict: "APPROVE_WITH_CHANGES",
      safetyClass: "SAFETY_LOW",
    });
  });

  it("treats legacy binary `SAFETY` token as SAFETY_HIGH (fail-closed backwards-compat)", () => {
    const legacy = [
      "## voltra-099 — Legacy",
      "- Round: **1**",
      "- Curation gate: ❌ BLOCK (verdict=`APPROVE_WITH_CHANGES`, safety-class=`SAFETY` — `gateBlocks()`)",
      "",
    ].join("\n");
    const [b] = parseCurationBlocks(legacy);
    expect(b.safetyClass).toBe("SAFETY_HIGH");
    expect(gateBlocks(b.verdict, b.safetyClass!)).toBe(true);
  });

  it("returns null fields when a block is malformed", () => {
    const malformed = [
      "## voltra-999 — Mystery",
      "- (no round, no gate line)",
      "",
    ].join("\n");
    const blocks = parseCurationBlocks(malformed);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe("voltra-999");
    expect(blocks[0].round).toBeNull();
    expect(blocks[0].safetyClass).toBeNull();
  });
});
