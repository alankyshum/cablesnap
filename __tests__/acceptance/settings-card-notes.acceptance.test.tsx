/**
 * BLD-258: Settings profile card layout + session notes/delete touch targets
 *
 * Validates:
 * - BodyProfileCard uses flowCardStyle for proper tablet layout
 * - Session action buttons (checkbox, notes, delete) have ≥48dp touch targets
 * - Notes input has adequate padding and font size
 */
import fs from "fs";
import path from "path";
import { flowCardStyle } from "../../components/ui/FlowContainer";

describe("Settings profile card layout (BLD-258, GitHub #125)", () => {
  const cardSource = fs.readFileSync(
    path.resolve(__dirname, "../../components/BodyProfileCard.tsx"),
    "utf-8"
  );

  it("BodyProfileCard imports flowCardStyle", () => {
    expect(cardSource).toContain("flowCardStyle");
  });

  it("BodyProfileCard card style uses flowCardStyle properties", () => {
    // flowCardStyle should define minWidth and flexGrow
    expect(flowCardStyle.minWidth).toBeGreaterThanOrEqual(280);
    expect(flowCardStyle.flexGrow).toBe(1);
  });
});

describe("Session notes/delete button touch targets (BLD-258, GitHub #126)", () => {
  const sessionSource = [
    fs.readFileSync(path.resolve(__dirname, "../../components/session/ExerciseGroupCard.tsx"), "utf-8"),
    fs.readFileSync(path.resolve(__dirname, "../../components/session/GroupCardHeader.tsx"), "utf-8"),
    fs.readFileSync(path.resolve(__dirname, "../../components/session/ExerciseNotesPanel.tsx"), "utf-8"),
    fs.readFileSync(path.resolve(__dirname, "../../components/session/SetRow.tsx"), "utf-8"),
  ].join("\n");

  it("action buttons have hitSlop for 48dp touch targets", () => {
    // All three action buttons (checkbox, notes, delete) should have hitSlop
    const hitSlopCount = (sessionSource.match(/hitSlop/g) || []).length;
    expect(hitSlopCount).toBeGreaterThanOrEqual(3);
  });

  it("action buttons are at least 36px wide", () => {
    expect(sessionSource).toContain("width: 36");
  });

  it("circleCheck is consistent size with action buttons", () => {
    // Both circleCheck and actionBtn should match in size (44dp post-BLD-558 for glove use).
    const circleCheckMatch = sessionSource.match(/circleCheck:\s*\{[^}]*width:\s*(\d+)/);
    const actionBtnMatch = sessionSource.match(/actionBtn:\s*\{[^}]*width:\s*(\d+)/);
    expect(circleCheckMatch).not.toBeNull();
    expect(actionBtnMatch).not.toBeNull();
    expect(circleCheckMatch![1]).toBe(actionBtnMatch![1]);
    expect(Number(actionBtnMatch![1])).toBeGreaterThanOrEqual(44);
  });

  it("notes input has minimum font size of 14", () => {
    const notesMatch = sessionSource.match(/input:\s*\{[^}]*fontSize:\s*fontSizes\.(\w+)/);
    expect(notesMatch).not.toBeNull();
    const token = notesMatch![1];
    const fontSizeMap: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20 };
    expect(fontSizeMap[token] ?? 0).toBeGreaterThanOrEqual(14);
  });

  it("notes container has adequate padding", () => {
    expect(sessionSource).toContain("container:");
    const containerMatch = sessionSource.match(
      /container:\s*\{[^}]*paddingHorizontal:\s*(\d+)/
    );
    expect(containerMatch).not.toBeNull();
    expect(Number(containerMatch![1])).toBeGreaterThanOrEqual(8);
  });
});
