---
name: cablesnap--i18n
description: "Validate and author CableSnap Lingui translations across runtime JSON catalogs and generated locale artifacts."
---

# CableSnap i18n

## Runtime and generated files

- Read runtime messages from `lib/i18n/index.ts` and `locales/{en-US,en-GB,zh-TW,zh-CN}.json`.
- Treat `lingui compile` output in `locales/*.js` as unused build output.
- Treat `locales/*.po` as extraction byproducts; do not backfill empty `msgstr` entries into `zh-TW.po`.
- Generate `locales/zh-CN.json` from zh-TW with `npm run i18n:zhcn`; hand-author only `zh-CN.overrides.json`.

## Verification

Run the checks in this order:

```text
npm run i18n:extract
npm run i18n:translate -- --locale zh-TW
npm run i18n:zhcn
npm run i18n:compile
npm run i18n:codegen
npm run i18n:check
npm run typecheck
jest __tests__/lib/i18n/locale-resolution.test.tsx __tests__/lib/language-preference.test.tsx __tests__/scripts/check-i18n-gate.test.ts __tests__/app/source-checks-batch.test.ts
```

Pass `--locale zh-TW` to `i18n:translate`; require the explicit test paths because the directory path omits suites.

## Authoring and coverage

- Use explicit dotted IDs with `t({id, message})`, `<Trans id>`, or `i18n._({id, message, values})`.
- Use ICU plural/select with named values instead of template literals or English ternaries. Give every `select` an `other` branch and make branch keys byte-exact runtime values.
- Check new IDs directly in `locales/en-US.json` and `locales/zh-TW.json`; generated message-key types and the gate do not detect IDs absent from every catalog.
- Keep `TAB_LABELS` in `components/floating-tab-bar/TabButton.tsx` untranslated for its compatibility test; render labels through `getTabLabels()`.
- Keep persisted or third-party data copy in its source language and denomination-specific symbols unchanged; document each decision with an inline code comment.
- Use fixed endonyms for language-picker options.

## Failure diagnosis

- Treat a raw dotted key as catalog absence.
- Treat raw ICU source as a parse failure, usually a malformed select or plural.
