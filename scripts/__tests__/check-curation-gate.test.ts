/**
 * BLD-743 — Tests for the deterministic curation gate.
 *
 * QD requested (comment e053f1d5) before wiring to pre-push:
 *   "a unit test with 3-4 fixture panel outputs (one with safety
 *    concerns, one without, one with formatting variation) before
 *    wiring to pre-push"
 *
 * These tests cover:
 *   - `extractSafetySection()` — robust parsing across panel Markdown
 *     variations (plain, ###, **bold**, with-colon, missing).
 *   - `classifySafety()` — SAFETY vs REFINEMENT vs N/A under each
 *     fixture type.
 *   - `gateBlocks()` — the canonical truth table from QD's ack
 *     (comment e053f1d5).
 *   - `parseCurationBlocks()` — recovery of round + verdict +
 *     safety-class from the rendered CURATION.md.
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

describe("classifySafety", () => {
  it("returns N/A when the section is absent", () => {
    expect(classifySafety("no safety section here\nVerdict\nAPPROVE\n")).toBe(
      "N/A",
    );
  });

  it("returns REFINEMENT when the section is present but lists no risks and no ratings", () => {
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

  it("returns SAFETY when a keyword is present even with no rating", () => {
    const panel = [
      "Safety Concerns",
      "- Recommend smoother phrasing to avoid implying a deadlift cue.",
      "",
      "Verdict",
      "APPROVE_WITH_CHANGES",
    ].join("\n");
    // "avoid" is in SAFETY_KEYWORDS — fail-closed by design
    expect(classifySafety(panel)).toBe("SAFETY");
  });

  it("returns SAFETY when a non-NONE rating token is present even with no keyword", () => {
    const panel = [
      "Safety Concerns",
      "- MEDIUM concern: knee tracking deviates from the foot under loaded eccentric.",
      "",
      "Verdict",
      "APPROVE_WITH_CHANGES",
    ].join("\n");
    expect(classifySafety(panel)).toBe("SAFETY");
  });

  it("does NOT trip on the literal token NONE", () => {
    const panel = [
      "Safety Concerns",
      "- Severity: NONE. Cues are well-bounded and the breath cadence is appropriate.",
      "",
      "Verdict",
      "APPROVE",
    ].join("\n");
    expect(classifySafety(panel)).toBe("REFINEMENT");
  });
});

describe("gateBlocks (truth table)", () => {
  // Mirrors QD's truth table from comment e053f1d5.
  const cases: Array<[string, SafetyClass, boolean]> = [
    ["APPROVE", "N/A", false],
    ["APPROVE", "REFINEMENT", false],
    ["APPROVE_WITH_CHANGES", "REFINEMENT", false],
    ["APPROVE_WITH_CHANGES", "SAFETY", true],
    ["APPROVE_WITH_CHANGES", "N/A", true], // fail-closed
    ["NEEDS_RESEARCH", "REFINEMENT", true],
    ["NEEDS_RESEARCH", "SAFETY", true],
    ["REJECT", "REFINEMENT", true],
    ["REJECT", "SAFETY", true],
    ["UNKNOWN", "REFINEMENT", true],
  ];
  it.each(cases)(
    "verdict=%s safety=%s → blocks=%s",
    (verdict, safety, expected) => {
      expect(gateBlocks(verdict, safety)).toBe(expected);
    },
  );

  it("is case-insensitive on the verdict token", () => {
    expect(gateBlocks("approve_with_changes", "REFINEMENT")).toBe(false);
    expect(gateBlocks("approve_with_changes", "SAFETY")).toBe(true);
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
    "- Curation gate: ❌ BLOCK (verdict=`APPROVE_WITH_CHANGES`, safety-class=`SAFETY` — `gateBlocks()`)",
    "- Visual: ok",
    "",
  ].join("\n");

  it("recovers id, round, verdict, and safety-class for each block", () => {
    const blocks = parseCurationBlocks(sample);
    expect(blocks).toHaveLength(2);
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
      safetyClass: "SAFETY",
    });
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
