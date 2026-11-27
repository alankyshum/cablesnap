// BLD-5100: covers AC21 (names, library guard) for PLAN-BLD-5100.md.
import React from "react";
import { render } from "@testing-library/react-native";
import { ProposalCard } from "../../components/agent-access/ProposalCard";
import type { AgentTemplateProposal } from "../../shared/agent-access";

const proposal: AgentTemplateProposal = {
  schemaVersion: "1",
  kind: "template-proposal",
  template: { name: "Upper", exercises: [{ exerciseId: "ex-1", targetSets: 3, targetReps: "8-10", restSeconds: 90 }] },
};

test("BLD-5100 AC21 review shows exercise names instead of raw IDs", () => {
  const view = render(<ProposalCard proposal={proposal} imported={false} busy={false} exerciseNames={{ "ex-1": "Standing Press" }} onImport={jest.fn()} />);
  expect(view.getByTestId("agent-proposal-exercise").props.children).toContain("Standing Press");
  expect(view.queryByText(/ex-1/)).toBeNull();
});

test("BLD-5100 AC21 unknown exercise is flagged and blocks import", () => {
  const view = render(<ProposalCard proposal={proposal} imported={false} busy={false} exerciseNames={{}} onImport={jest.fn()} />);
  expect(view.getByTestId("agent-proposal-library-warning")).toBeTruthy();
  expect(view.getByTestId("agent-import-proposal").props.accessibilityState.disabled).toBe(true);
});
