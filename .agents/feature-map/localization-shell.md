---
id: localization-shell
title: Language, App Shell, and Error Recovery
aliases: ["language", "translations", "i18n", "app crash", "error screen", "theme", "navigation", "tab bar", "offline"]
routes: ["/errors", "/settings/language"]
paths: ["app/_layout.tsx", "app/errors.tsx", "app/settings/language.tsx", "components/ui/**", "components/charts/**", "components/floating-tab-bar/**", "components/FloatingTabBar.tsx", "components/ErrorBoundary.tsx", "components/LayoutBanners.tsx", "components/LayoutToastBridge.tsx", "components/DatabaseUnavailableScreen.tsx", "components/WebUnsupportedScreen.tsx", "hooks/useAppInit.ts", "hooks/useColor.ts", "hooks/useColorScheme.ts", "hooks/useReducedMotion.ts", "hooks/useThemeColors.ts", "lib/animations/**", "lib/i18n/**", "lib/language-preference.tsx", "lib/theme-preference.tsx", "lib/errors.ts", "lib/query.tsx", "lib/layout.ts"]
---
# Language, App Shell, and Error Recovery

Root navigation/providers, floating tabs, language/theme/accessibility preferences, shared UI/charts, and recoverable app/database errors.

## Sub-features
- Locale selection, translated messages, theme/reduced motion, startup banners/toasts, error log screen.

## How to get to it (user POV)
- Use **Settings → Language** or appearance controls.
- Error recovery appears automatically; `/errors` shows captured diagnostics.

## Code entry points
- `app/_layout.tsx` — root providers and navigation.
- `lib/i18n/` + `app/settings/language.tsx` — locale runtime and picker.
- `components/ui/` — shared design system primitives.

## Gotchas
- Generated translation keys/catalogs have their own commands; root provider order and tab safe-area behavior are cross-cutting.
