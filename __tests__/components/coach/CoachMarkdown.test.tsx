import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { CoachMarkdown, hasMarkdownTable } from "@/components/coach/CoachMarkdown";
import { lightColors, darkColors } from "@/theme/colors";

const mockUseThemeColors = jest.fn();
const mockUseColorScheme = jest.fn();

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => mockUseThemeColors(),
}));

jest.mock("@/hooks/useColorScheme", () => ({
  useColorScheme: () => mockUseColorScheme(),
}));

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function hexToLuminance(hex: string): number {
  const h = hex.replace(/^#/, "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function calcContrastRatio(hex1: string, hex2: string): number {
  const l1 = hexToLuminance(hex1);
  const l2 = hexToLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("CoachMarkdown", () => {
  beforeEach(() => {
    mockUseColorScheme.mockReturnValue("dark");
    mockUseThemeColors.mockReturnValue({
      primary: darkColors.primary,
      onPrimary: darkColors.primaryForeground,
      surface: darkColors.card,
      surfaceVariant: darkColors.muted,
      surfaceAlt: "#1A1F26",
      onSurface: darkColors.foreground,
      onSurfaceVariant: darkColors.mutedForeground,
      outlineVariant: darkColors.border,
      pacingRest: darkColors.pacingRest,
    });
  });

  it("renders a GFM table as rows and cells with themed container and tokens", () => {
    const { getByText, getAllByTestId, getByTestId } = render(
      <CoachMarkdown text={"| Exercise | Sets |\n| :--- | ---: |\n| Squat | 3 |"} />,
    );

    expect(getByText("Exercise")).toBeTruthy();
    expect(getByText("Squat")).toBeTruthy();
    expect(getAllByTestId("coach-markdown-table-row")).toHaveLength(2);
    expect(getByTestId("coach-markdown-table-container")).toBeTruthy();
  });

  it("renders inline Markdown and HTML breaks inside table cells", () => {
    const { getByText, queryByText } = render(
      <CoachMarkdown text={"| Exercise | Prescription |\n| --- | --- |\n| **Squat** | 3 sets<br>8 reps |"} />,
    );

    const bold = getByText("Squat");
    const boldStyles = Array.isArray(bold.props.style) ? Object.assign({}, ...bold.props.style) : bold.props.style;
    expect(boldStyles.fontWeight).toBe("700");
    expect(getByText("3 sets\n8 reps")).toBeTruthy();
    expect(queryByText(/<br>/)).toBeNull();
  });

  it("uses the same width for each column across every row", () => {
    const { getAllByTestId, getByTestId } = render(
      <CoachMarkdown text={"| Exercise | Sets | Notes |\n| --- | --- | --- |\n| Squat with a long name | 3 | Heavy |\n| Row | 12 | Short |"} />,
    );

    for (const columnIndex of [0, 1, 2]) {
      const widths = getAllByTestId(`coach-markdown-table-cell-blk-0-${columnIndex}`)
        .map((cell) => Object.assign({}, ...cell.props.style).width);
      expect(new Set(widths).size).toBe(1);
    }

    const scroll = getByTestId("coach-markdown-table-scroll");
    expect(scroll.props.horizontal).toBe(true);
    expect(scroll.props.directionalLockEnabled).toBe(true);
  });

  it("keeps incomplete markdown safe while streaming", () => {
    expect(() => render(<CoachMarkdown text={"```\nhttps://example.test/"} />)).not.toThrow();
    expect(() => render(<CoachMarkdown text={"| Exercise | Sets |\n| --- |"} />)).not.toThrow();
    expect(() => render(<CoachMarkdown text={"**still typing"} />)).not.toThrow();
    expect(() => render(<CoachMarkdown text={"*italic typing"} />)).not.toThrow();
    expect(() => render(<CoachMarkdown text={"`inline code"} />)).not.toThrow();
    expect(() => render(<CoachMarkdown text={"[link title]("} />)).not.toThrow();
  });

  it("preserves verified heading sizes (H1 21px, H2 18px, H3 18px vs body 16px)", () => {
    const { getByText } = render(
      <CoachMarkdown text={"# Main Heading\n## Sub Heading\n### Minor Heading\nParagraph text"} />,
    );

    const h1 = getByText("Main Heading");
    const h2 = getByText("Sub Heading");
    const h3 = getByText("Minor Heading");
    const p = getByText("Paragraph text");

    const h1Styles = Array.isArray(h1.props.style) ? Object.assign({}, ...h1.props.style) : h1.props.style;
    const h2Styles = Array.isArray(h2.props.style) ? Object.assign({}, ...h2.props.style) : h2.props.style;
    const h3Styles = Array.isArray(h3.props.style) ? Object.assign({}, ...h3.props.style) : h3.props.style;
    const pStyles = Array.isArray(p.props.style) ? Object.assign({}, ...p.props.style) : p.props.style;

    expect(h1Styles.fontSize).toBe(21);
    expect(h2Styles.fontSize).toBe(18);
    expect(h3Styles.fontSize).toBe(18);
    expect(pStyles.fontSize).toBe(16);
  });

  it("renders lists with markers and inline items", () => {
    const { getByText } = render(
      <CoachMarkdown text={"- First bullet\n- Second bullet\n1. Numbered item"} />,
    );

    expect(getByText("First bullet")).toBeTruthy();
    expect(getByText("Second bullet")).toBeTruthy();
    expect(getByText("Numbered item")).toBeTruthy();
    expect(getByText("1.")).toBeTruthy();
  });

  it("renders nested list items and accessible GFM task checkboxes", () => {
    const { getByText, getByTestId } = render(
      <CoachMarkdown text={"- Parent item\n  - Nested **item**\n- [ ] Warm up\n- [x] Main work"} />,
    );

    expect(getByText("Parent item")).toBeTruthy();
    expect(getByText(/Nested/)).toBeTruthy();
    expect(getByText("item")).toBeTruthy();
    expect(getByText("Warm up")).toBeTruthy();
    expect(getByText("Main work")).toBeTruthy();
    expect(getByTestId("coach-markdown-checkbox-unchecked").props.accessibilityState).toEqual({
      checked: false,
      disabled: true,
    });
    expect(getByTestId("coach-markdown-checkbox-checked").props.accessibilityState).toEqual({
      checked: true,
      disabled: true,
    });
  });

  it("preserves block content nested inside list items", () => {
    const { getByText, getByTestId } = render(
      <CoachMarkdown
        text={"1. Day A\n\n   | Exercise | Sets |\n   | --- | --- |\n   | **Squat** | 3 |\n\n   > Keep your torso braced.\n\n   ```\n   controlled tempo\n   ```"}
      />,
    );

    expect(getByText("Day A")).toBeTruthy();
    expect(getByTestId("coach-markdown-table-container")).toBeTruthy();
    expect(getByText("Squat")).toBeTruthy();
    expect(getByText("Keep your torso braced.")).toBeTruthy();
    expect(getByText("controlled tempo")).toBeTruthy();
  });

  it("detects a rendered table nested inside a list item", () => {
    expect(hasMarkdownTable("1. Day A\n\n   | Exercise | Sets |\n   | --- | --- |\n   | Squat | 3 |"))
      .toBe(true);
    expect(hasMarkdownTable("    | code | only |\n    | --- | --- |"))
      .toBe(false);
  });

  it("preserves blockquote styling", () => {
    const { getByText } = render(<CoachMarkdown text={"> Styled quote\n>\n> - Quoted item"} />);
    const quote = getByText("Styled quote");
    const quoteStyles = Array.isArray(quote.props.style)
      ? Object.assign({}, ...quote.props.style.flat(Infinity).filter(Boolean))
      : quote.props.style;
    expect(quoteStyles.fontStyle).toBe("italic");
    const quotedItem = getByText("Quoted item");
    const quotedItemStyles = Array.isArray(quotedItem.props.style)
      ? Object.assign({}, ...quotedItem.props.style.flat(Infinity).filter(Boolean))
      : quotedItem.props.style;
    expect(quotedItemStyles.fontStyle).toBe("italic");
  });

  it("renders CommonMark additions and keeps raw HTML safe", () => {
    const { getByText, getByTestId, queryByText } = render(
      <CoachMarkdown text={"Setext heading\n==============\n\nText  \nnext line\n\n---\n\n<script>alert('x')</script>Safe"} />,
    );

    expect(getByText("Setext heading")).toBeTruthy();
    expect(getByText("Text\nnext line")).toBeTruthy();
    expect(getByText("alert('x')Safe")).toBeTruthy();
    expect(queryByText(/<script>/)).toBeNull();
    expect(getByTestId("coach-markdown-horizontal-rule")).toBeTruthy();
  });

  it("renders blockquotes and inline formatting", () => {
    const { getByText } = render(
      <CoachMarkdown text={"> A powerful quote\n\n**Bold**, *Italic*, ~~Strike~~, and `inlineCode`"} />,
    );

    expect(getByText("A powerful quote")).toBeTruthy();
    expect(getByText("Bold")).toBeTruthy();
    expect(getByText("Italic")).toBeTruthy();
    expect(getByText("Strike")).toBeTruthy();
    expect(getByText("inlineCode")).toBeTruthy();
  });

  it("handles link presses via onLinkPress prop", () => {
    const onLinkPress = jest.fn();
    const { getByText } = render(
      <CoachMarkdown text={"[Open Guide](https://example.com)"} onLinkPress={onLinkPress} />,
    );

    const link = getByText("Open Guide");
    fireEvent.press(link);
    expect(onLinkPress).toHaveBeenCalledWith("https://example.com");
  });

  it("satisfies WCAG AA contrast (≥ 4.5:1) for all tokens in both light and dark themes", () => {
    // Dark mode Assistant bubble
    const darkAssistantBg = darkColors.muted; // #21262D
    const darkAssistantText = darkColors.foreground; // #F0F2F5
    const darkAssistantLink = darkColors.primary; // #FF7A55
    const darkCardBg = darkColors.card; // #161B22

    expect(calcContrastRatio(darkAssistantText, darkAssistantBg)).toBeGreaterThanOrEqual(4.5);
    expect(calcContrastRatio(darkAssistantLink, darkAssistantBg)).toBeGreaterThanOrEqual(4.5);
    expect(calcContrastRatio(darkAssistantText, darkCardBg)).toBeGreaterThanOrEqual(4.5);

    // Light mode Assistant bubble
    const lightAssistantBg = lightColors.muted; // #E5E7EB
    const lightAssistantText = lightColors.foreground; // #1A2138
    const lightAssistantLink = lightColors.pacingRest; // #08415C
    const lightCardBg = lightColors.card; // #F3F4F6

    expect(calcContrastRatio(lightAssistantText, lightAssistantBg)).toBeGreaterThanOrEqual(4.5);
    expect(calcContrastRatio(lightAssistantLink, lightAssistantBg)).toBeGreaterThanOrEqual(4.5);
    expect(calcContrastRatio(lightAssistantText, lightCardBg)).toBeGreaterThanOrEqual(4.5);

    // User bubbles (outgoing on primary)
    const lightUserBg = lightColors.primary; // #FF6038
    const lightUserText = lightColors.primaryForeground; // #1A2138
    expect(calcContrastRatio(lightUserText, lightUserBg)).toBeGreaterThanOrEqual(4.5);

    const darkUserBg = darkColors.primary; // #FF7A55
    const darkUserText = darkColors.primaryForeground; // #1A2138
    expect(calcContrastRatio(darkUserText, darkUserBg)).toBeGreaterThanOrEqual(4.5);
  });
});
