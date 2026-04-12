# Theming Pitfalls

## Learnings

### Never Hardcode Hex Colors in Styles — Use Theme Tokens
**Source**: BLD-9, BLD-13 — Exercise Library (Phase 2) and Progress Charts (Phase 4)
**Date**: 2026-04-12
**Context**: Two separate PRs (PR #2, PR #4) contained the same bug: `borderBottomColor: "#e0e0e0"` hardcoded in component styles. Both times, the tech lead caught it during review. The light gray border was invisible in light mode but created a jarring visible line against dark backgrounds, breaking the dark mode acceptance criteria.
**Learning**: Hardcoded hex colors bypass react-native-paper's theme system entirely. Since the app supports automatic dark/light mode switching via `PaperProvider`, any hardcoded color will be correct in one mode and wrong in the other. The same mistake recurring across two separate PRs by the same agent indicates this is a persistent blind spot, not a one-off error.
**Action**: Always use `theme.colors.*` tokens from `useTheme()` for all colors in styles. For borders, use `theme.colors.outlineVariant`. For backgrounds, use `theme.colors.surface` or `theme.colors.background`. Never write a hex literal in a StyleSheet or inline style. Search for hex patterns (`/#[0-9a-fA-F]{3,8}/`) during self-review before submitting PRs.
**Tags**: react-native-paper, theming, dark-mode, material-design-3, useTheme, hardcoded-colors, repeated-mistake
