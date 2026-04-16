# Theming Pitfalls

## Learnings

### Design Token Drift Extends Beyond Colors — Seven Categories Need Tokenization
**Source**: BLD-236/237 — Investor demo pixel slop audit and cleanup
**Date**: 2026-04-16
**Context**: A pre-demo audit of visual consistency across FitForge found hardcoded values scattered across 23 files in seven distinct categories, despite an existing design token system. The "Never Hardcode Hex Colors" rule had been enforced for colors, but five other value types had drifted silently: border radii (28 instead of 9999 for pills, off-grid values like 6/10/14), modal overlay opacities (four different values: 0.3, 0.5, 0.55, 0.6), font sizes off the MD3 type scale (13, 15, 18), animation durations (mixed 200/250/400ms), and elevation/shadow values.
**Learning**: Color tokenization alone prevents only one category of visual drift. Border radii, overlay opacities, font sizes, animation durations, and elevation values all accumulate inconsistency at the same rate as colors. Each category needs its own design token (radii.sm/md/lg/xl/pill, scrim token, typography scale, duration.fast/normal/slow, elevation tokens).
**Action**: When implementing new UI components, use design tokens for ALL seven categories: (1) colors, (2) border radii, (3) overlay/scrim opacities, (4) font sizes, (5) animation durations, (6) elevation/shadows, (7) spacing. Never use magic numbers for any of these. During self-review, grep for numeric literals in style objects — any raw number that isn't 0 or 1 is suspect.
**Tags**: design-tokens, pixel-slop, border-radius, animation, opacity, font-size, elevation, design-system, visual-consistency

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

### MD3 Container Tokens Need Separate Light/Dark Values for WCAG Contrast
**Source**: BLD-21 — FIX: A11y contrast — font/label background insufficient (GitHub #15)
**Date**: 2026-04-13
**Context**: The theme defined a single set of container colors (primaryContainer, secondaryContainer, tertiaryContainer) shared between light and dark themes. Light-mode container values like pale green were used in dark mode, creating low-contrast containers against dark text that failed WCAG 4.5:1.
**Learning**: MD3 container tokens (primaryContainer, onPrimaryContainer, etc.) must have separate values for light and dark themes. Light mode uses light container backgrounds with dark foregrounds; dark mode inverts this (dark container backgrounds with light foregrounds). Sharing one color set across both themes guarantees contrast failure in one mode.
**Action**: In constants/theme.ts, maintain separate `lightColors` and `darkColors` objects for all container/onContainer token pairs. Apply `lightColors` to the light theme and `darkColors` to the dark theme. After any theme change, manually verify contrast in both modes — automated WCAG checks are not yet in the pipeline.
**Tags**: a11y, wcag, contrast, material-design-3, container-tokens, dark-mode, light-mode, theming, react-native-paper

### Numeric Map Keys Collide Across Unit Systems — Use Unit-Qualified Keys
**Source**: BLD-20 — Barbell Plate Calculator (Phase 17)
**Date**: 2026-04-13
**Context**: Plate colors were looked up by numeric weight (e.g., `plateColors[25]`). Competition standards assign different colors per unit system (25kg = red, 25lb = green), but both mapped to the same numeric key, so lb users saw kg colors.
**Learning**: When two unit systems (kg/lb, cm/in) share numeric values that map to different outputs, using plain numeric keys in a lookup map causes silent collisions. The code compiles fine and appears correct when tested with only one unit system.
**Action**: Use composite string keys that include the unit (e.g., `"25kg"`, `"25lb"`) in any lookup map where kg and lb values overlap. Always test features with the non-default unit system — collisions only surface when both systems are exercised.
**Tags**: units, lookup-map, key-collision, kg-lb, theming, plate-colors, dual-unit, testing
