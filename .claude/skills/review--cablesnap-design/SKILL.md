---
name: review--cablesnap-design
description: "Review CableSnap changes for design system compliance: design tokens, theme colors, spacing, animations."
---

# CableSnap Design System Review

Deterministic + LLM code review for the **CableSnap** app. Enforces mandatory use of design tokens, theme colors, animation presets, and UI component library.

## References

- `constants/design-tokens.ts` — Spacing, radii, typography, elevation, animation timing tokens
- `constants/theme.ts` — Electric Coral palette, MD3 color mapping, semantic domain colors
- `lib/animations/` — Animation hooks, primitives, layout presets, screen transitions
- `components/ui/` — Animated component wrappers (PressableCard, AnimatedButton, etc.)

## Tech Stack

- React Native 0.81 + Expo SDK 54 + TypeScript
- react-native-paper (MD3) for UI components
- react-native-reanimated v4 for animations
- StyleSheet.create for styling (no CSS-in-JS)

## Rule Index

| ID | Severity | Name | Files | Auto |
|----|----------|------|-------|------|
| RULE-001 | critical | Raw Hex Colors | screen, component, lib, animation | yes |
| RULE-002 | high | Hardcoded Spacing Values | screen, component | yes |
| RULE-003 | high | Hardcoded Border Radius | screen, component | yes |
| RULE-004 | medium | Inline Shadow Styles | screen, component | yes |
| RULE-005 | high | Missing Design Token Import | screen, component | yes |
| RULE-006 | medium | Raw Font Size Literals | screen, component | yes |
| RULE-007 | critical | Untokenized Color Property | screen, component, lib | yes |
| RULE-008 | high | Animation Accessibility | screen, component, animation | LLM |
| RULE-009 | medium | Component Library Usage | screen, component | LLM |
| RULE-010 | medium | Color Contrast | screen, component | LLM |
| RULE-011 | low | Token Naming Consistency | constant | LLM |
| RULE-012 | high | Rendered Design Quality | screen, component | e2e |

> **Note:** 7 of the 11 static rules have deterministic checks via `review_rules.py`. RULE-012 runs Playwright e2e tests that render the actual page and measure computed styles.

## Severity Guide

| Level | Emoji | Meaning |
|-------|-------|---------|
| critical | red | Breaks design consistency, must fix before merge |
| high | orange | Design token violation, should fix |
| medium | yellow | Improvement opportunity |
| low | green | Nice-to-have, naming/style preference |

## Workflow

```
Step 0: Get the diff (gh pr diff or git diff origin/main...HEAD)
Step 1: Classify changed files (review_file_classifier.py)
Step 2: Run deterministic rules (review_rules.py)
Step 2.5: Run rendered design quality tests (Playwright e2e)
Step 3: LLM evaluation (RULE-008 through RULE-012)
Step 4: Output structured findings grouped by severity
```

### Step 0: Get the Diff

```bash
gh pr diff <PR_NUMBER>
# or for local changes:
git diff origin/main...HEAD --name-only
```

### Step 1: Classify Files

```bash
SCRIPT_DIR="$HOME/.claude/skills/review--cablesnap-design/scripts"
python3 "$SCRIPT_DIR/review_file_classifier.py" <file1> <file2> ...
```

### Step 2: Deterministic Rule Checks

```bash
python3 "$SCRIPT_DIR/review_rules.py" <file1> <file2> ...

# Filter by severity:
python3 "$SCRIPT_DIR/review_rules.py" --severity critical,high <file1> <file2> ...

# List available rules:
python3 "$SCRIPT_DIR/review_rules.py" --list-rules
```

These findings are deterministic and do NOT need LLM verification.

### Step 2.5: Rendered Design Quality Tests (RULE-012)

When the diff touches screens or components, run the Playwright design quality suite against the Expo web build. These tests render the actual page in a browser and measure computed styles, contrast, spacing, touch targets, and layout — catching issues that static analysis cannot detect (e.g., chip text misaligned because a forced height conflicts with a library's internal padding).

**Prerequisites:** Expo web server running on port 8081 and Chromium installed for Playwright.

```bash
cd ~/Documents/gitproj/cablesnap

# Start Expo web if not running (the test config auto-starts it, but pre-starting is faster)
# npx expo start --web --port 8081

# Run design quality + chip layout tests
npm run test:e2e:design

# Or run the full e2e suite (includes visual snapshots + a11y audit)
npm run test:e2e
```

**Route coverage:** Tests run against ALL app routes (5 tabs + 4 tools + 12 standalone + 4 dynamic [id] + 3 onboarding = 28 total) at three viewport sizes (mobile 390×844, tablet 768×1024, desktop 1280×800). Dynamic routes use known seed IDs (e.g., `voltra-001`, `starter-tpl-1`). Onboarding screens are tested separately without the `__SKIP_ONBOARDING__` flag.

**Test suites and what they check:**

| Test file | Check | Fails on |
|-----------|-------|----------|
| `e2e/design-quality.spec.ts` | Typography: font size scale < 12 distinct sizes | Inconsistent typography |
| | Color: background palette < 15 distinct colors | Uncontrolled color proliferation |
| | Color: text palette < 10 distinct colors | Too many text colors |
| | Spacing: gap scale < 20 distinct values | Ad-hoc spacing |
| | Responsiveness: no horizontal overflow | Elements breaking viewport |
| | Responsiveness: edge padding >= 8px | Content flush against viewport edge (missing padding) |
| | Responsiveness: content max-width on tablet+ | Content stretching too wide on large screens |
| | Accessibility: touch targets >= 44x44px | Undersized interactive elements |
| | Accessibility: text contrast WCAG AA | Low contrast (warns, does not hard-fail) |
| `e2e/chip-layout.spec.ts` | Chip outer/inner height match | Forced heights causing overflow |
| | Chip text vertically centered | Text drifting off-center |
| `e2e/exercises.spec.ts` | Visual snapshot regression | Any visual change vs baseline |
| | axe-core WCAG 2.1 AA audit | Accessibility violations |

**Interpreting results:**

- **All pass:** No rendered design issues. Proceed.
- **Failures:** Read the assertion message — it includes the specific elements, their measured values, and the threshold violated. These are real rendered bugs that must be fixed before merge.
- **Annotations (warnings):** Contrast and touch target warnings for framework-level elements (e.g., react-native-paper Banner action buttons). Review but do not block merge.
- **Visual snapshot diff:** If `exercises.spec.ts` visual snapshot fails, the diff shows pixel-level changes. Accept the new baseline with `npm run test:e2e:update` only if the visual change is intentional.

### Step 3: LLM Evaluation Rules

#### RULE-008: Animation Accessibility
**Files:** screen, component, animation | **Severity:** high

Custom animations must respect `useReducedMotion()`. Check that:
1. Every file using `useSharedValue`/`withTiming`/`withSpring` also calls `useReducedMotion()`
2. When reduced motion is enabled, animations either skip or become instant
3. `Haptics` calls are tied to meaningful interactions, not decorative animations

#### RULE-009: Component Library Usage
**Files:** screen, component | **Severity:** medium

Prefer `components/ui/` wrappers over raw react-native-paper components when an animated variant exists:
- `PressableCard` over `Card` (when card is pressable)
- `AnimatedButton` over `Button` (for primary CTAs)
- `AnimatedFAB` over `FAB`
- `Toast` over `Snackbar` (for ephemeral messages)

#### RULE-010: Color Contrast
**Files:** screen, component | **Severity:** medium

New color combinations should maintain WCAG AA contrast ratios:
- 4.5:1 for normal text
- 3:1 for large text and UI components
- Check both light and dark mode variants

#### RULE-011: Token Naming Consistency
**Files:** constant | **Severity:** low

New semantic colors added to `constants/theme.ts` should follow existing naming patterns:
- Use descriptive names matching their purpose (e.g., `protein`, `beginner`)
- Provide both light and dark variants where needed
- Document the color's intended usage

#### RULE-012: Rendered Design Quality
**Files:** screen, component | **Severity:** high | **Check type:** e2e (Playwright)

This rule is checked by running `npm run test:e2e:design` (see Step 2.5). If the diff touches screens or components, the reviewing agent MUST:

1. Run `npm run test:e2e:design` and capture the output
2. If all tests pass, report RULE-012 as passing
3. If tests fail, include each failure as a finding with:
   - The test name (e.g., "typography: uses a limited font size scale")
   - The assertion message (includes measured values and thresholds)
   - Severity: **high** for hard failures, **medium** for annotation-only warnings
4. If the Expo web server is not available, skip RULE-012 and note it was skipped

Common failure patterns and fixes:
- **Font size count too high:** New screen introduces bespoke font sizes — use `typography` tokens from `constants/design-tokens.ts` or Paper `<Text variant>`
- **Color count too high:** Hardcoded colors in styles — use `theme.colors.*` or `semantic.*` from theme
- **Spacing count too high:** Hardcoded margin/padding values — use `spacing.*` from design tokens
- **Touch target too small:** Interactive element below 44x44px — add `minWidth: 48, minHeight: 48` or use `contentStyle`
- **Chip height mismatch:** Forced `height` on a `<Chip>` — use `paddingVertical: 0` with `compact` instead
- **Horizontal overflow:** Element wider than viewport — check `width`, `paddingHorizontal`, or `FlatList` horizontal scroll
- **Edge padding missing:** Content text/inputs flush against viewport edge (< 8px inset) — add `contentContainerStyle={{ padding: 16 }}` to FlashList/FlatList or `padding: spacing.base` to the container View. Common on tool screens using FlashList without `contentContainerStyle`.
- **Content too wide on tablet:** Content stretches edge-to-edge on 768px+ viewports — add `maxWidth: 720, alignSelf: 'center'` or use a constrained container wrapper

### Step 4: Output Findings

Group findings by severity (critical -> high -> medium -> low) with file paths, line numbers, and fix suggestions.

## Platform Safety Rules

### No `crypto.randomUUID()` — use `uuid()` from `lib/uuid.ts`
`crypto.randomUUID()` is not available in all React Native runtimes (crashes on some Android/Hermes and web environments). Always use the `uuid()` wrapper from `lib/uuid.ts` which delegates to `expo-crypto`.

```ts
// BAD
const id = crypto.randomUUID();

// GOOD
import { uuid } from "../uuid";
const id = uuid();
```

### No `Alert.alert()` on cross-platform screens — use `confirmAction()` from `lib/confirm.ts`
`Alert.alert()` silently does nothing on web. Use `confirmAction()` which falls back to `window.confirm()` on web.

## Exempt Files

These files are allowed to contain raw color/spacing values:

- `constants/theme.ts` — Token definition file
- `constants/design-tokens.ts` — Token definition file
- `components/muscle-paths.ts` — SVG path data
- `**/*.test.*` / `__tests__/**` — Test files

## Token Quick Reference

### Spacing (import { spacing } from 'constants/design-tokens')
`xxs: 2, xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32, xxxl: 48`

### Radii (import { radii } from 'constants/design-tokens')
`none: 0, sm: 4, md: 8, lg: 12, xl: 16, xxl: 24, pill: 9999`

### Elevation (import { elevation } from 'constants/design-tokens')
`none, low, medium, high` — spread into style: `...elevation.medium`

### Typography (import { typography } from 'constants/design-tokens')
`display, heroNumber, statValue` — for large numbers; use Paper `<Text variant>` for body text

### Colors (const theme = useTheme())
`theme.colors.primary, theme.colors.onSurface, theme.colors.surfaceVariant, ...`
For domain colors: `import { semantic, accent } from 'constants/theme'`
