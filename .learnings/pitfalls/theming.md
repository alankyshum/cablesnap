# Theming Pitfalls

## Learnings

### Per-Value Contrast Colors for Semantic Badges
**Source**: BLD-21 — A11y contrast fix (GitHub #15)
**Date**: 2026-04-13
**Context**: Difficulty badges (beginner/intermediate/advanced) used a single static `onSemantic: "#ffffff"` for text color. White text on the orange intermediate badge failed WCAG contrast requirements, causing a user-reported a11y issue.
**Learning**: Semantic color palettes where each value has a different hue/lightness (green, orange, red) cannot use a single foreground color for all values. Orange (#FF9800) needs black text for 4.5:1 contrast; red and green need white. A static `onSemantic` constant is fundamentally wrong for multi-hue palettes.
**Action**: Define a per-value text color function (e.g., `difficultyText(level)`) that returns the correct contrast color for each semantic value. Do not use a single `onX` constant when the `X` colors span a wide lightness range. Test each combination against WCAG 2.1 AA (4.5:1 for normal text).
**Tags**: a11y, wcag, contrast, semantic-colors, theming, dark-mode, badges, per-value

### Never Hardcode Hex Colors in Styles — Use Theme Tokens
**Source**: BLD-9, BLD-13 — Exercise Library (Phase 2) and Progress Charts (Phase 4)
**Date**: 2026-04-12
**Context**: Two separate PRs (PR #2, PR #4) contained the same bug: `borderBottomColor: "#e0e0e0"` hardcoded in component styles. Both times, the tech lead caught it during review. The light gray border was invisible in light mode but created a jarring visible line against dark backgrounds, breaking the dark mode acceptance criteria.
**Learning**: Hardcoded hex colors bypass react-native-paper's theme system entirely. Since the app supports automatic dark/light mode switching via `PaperProvider`, any hardcoded color will be correct in one mode and wrong in the other. The same mistake recurring across two separate PRs by the same agent indicates this is a persistent blind spot, not a one-off error.
**Action**: Always use `theme.colors.*` tokens from `useTheme()` for all colors in styles. For borders, use `theme.colors.outlineVariant`. For backgrounds, use `theme.colors.surface` or `theme.colors.background`. Never write a hex literal in a StyleSheet or inline style. Search for hex patterns (`/#[0-9a-fA-F]{3,8}/`) during self-review before submitting PRs.
**Tags**: react-native-paper, theming, dark-mode, material-design-3, useTheme, hardcoded-colors, repeated-mistake
