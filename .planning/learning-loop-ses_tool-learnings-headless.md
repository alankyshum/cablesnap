# Headless learning loop: CableSnap settings localization

## Numbered learnings and destinations

1. **Runtime JSON is the locale source of truth** — Import locale JSON through `lib/i18n/index.ts`; treat compiled JavaScript and PO files as generated artifacts, and never hand-backfill empty zh-TW PO translations. Destination: `.claude/skills/cablesnap--i18n/SKILL.md`.
2. **Use the complete i18n verification sequence** — Extract, translate zh-TW with the required locale argument, generate zh-CN, compile, codegen, check, typecheck, then run the four explicit Jest paths. Destination: `.claude/skills/cablesnap--i18n/SKILL.md`.
3. **Generate Simplified Chinese from Traditional Chinese** — Run the OpenCC generator and edit only the overrides file for hand-authored zh-CN changes. Destination: `.claude/skills/cablesnap--i18n/SKILL.md`.
4. **Author Lingui messages with explicit IDs and valid ICU** — Use dotted IDs, named ICU values, an `other` select branch, and byte-exact branch keys. Destination: `.claude/skills/cablesnap--i18n/SKILL.md`.
5. **Verify catalog coverage independently** — Search both runtime JSON catalogs for every new ID because generated message-key types and the i18n gate can pass when an unextracted ID silently falls back to English. Destination: `.claude/skills/cablesnap--i18n/SKILL.md`.
6. **Preserve compatibility labels and data semantics** — Keep `TAB_LABELS` untranslated, keep source-language third-party copy and denomination-specific symbols, document those choices inline, and use fixed endonyms in language pickers. Destination: `.claude/skills/cablesnap--i18n/SKILL.md`.
7. **Diagnose localization symptoms by rendered form** — A raw dotted key indicates missing catalog coverage; raw ICU syntax indicates a parsing error. Destination: memory only, source `<source: session learning>`.
8. **Independently audit implementation claims** — Require pasted grep or command evidence after every implementation dispatch and compare the audit with the prior round’s intent rather than only with Git HEAD. Destination: memory only, source `<source: session learning>`.
9. **Constrain delegated reports** — Ask implementation agents for plain-text reports of roughly 300–400 words without long code blocks to prevent truncated evidence. Destination: memory only, source `<source: session learning>`.
10. **Audit verification-gate changes for self-approval** — Reject wildcard or loosened allowlists and softened assertions; permit only narrowly scoped exact IDs with existing checks preserved. Destination: memory only, source `<source: session learning>`.

## Memory retention notes

- Retain learnings 7–10 as durable episodes with source `<source: session learning>`.
- Retain learnings 1–6 through the project skill; do not duplicate them as memory episodes.
- No existing project instruction or skill contained these CableSnap i18n execution rules. Existing bottom-sheet learnings were unrelated and skipped as duplicates only where topic overlap was absent.

## Exact skill diff

Created `.claude/skills/cablesnap--i18n/SKILL.md` with runtime/generated-file rules, the ordered verification commands, authoring and coverage rules, compatibility/data semantics, and failure diagnosis.

## Exact memory retention text

- **Localization symptom diagnosis:** “Treat a raw dotted message key as missing catalog coverage and raw ICU source as a message parsing failure.” `<source: session learning>`
- **Evidence-based delegation audits:** “After each implementation dispatch, independently require pasted grep or command evidence and compare against the prior round’s intent, not only Git HEAD.” `<source: session learning>`
- **Concise delegated reports:** “Request plain-text implementation reports of roughly 300–400 words without long code blocks.” `<source: session learning>`
- **Verification-gate audit:** “Audit allowlist and gate diffs for exact IDs only; reject wildcards, removals, loosened checks, and softened assertions.” `<source: session learning>`

## applied.log lines

```text
ses_tool-learnings-headless | CableSnap i18n runtime and generated files | skill .claude/skills/cablesnap--i18n/SKILL.md | <source: session learning>
ses_tool-learnings-headless | CableSnap i18n verification sequence | skill .claude/skills/cablesnap--i18n/SKILL.md | <source: session learning>
ses_tool-learnings-headless | CableSnap zh-CN generation boundary | skill .claude/skills/cablesnap--i18n/SKILL.md | <source: session learning>
ses_tool-learnings-headless | Lingui explicit IDs and ICU authoring | skill .claude/skills/cablesnap--i18n/SKILL.md | <source: session learning>
ses_tool-learnings-headless | Independent catalog coverage check | skill .claude/skills/cablesnap--i18n/SKILL.md | <source: session learning>
ses_tool-learnings-headless | Compatibility labels and data semantics | skill .claude/skills/cablesnap--i18n/SKILL.md | <source: session learning>
ses_tool-learnings-headless | Localization symptom diagnosis | memory | <source: session learning>
ses_tool-learnings-headless | Evidence-based delegation audits | memory | <source: session learning>
ses_tool-learnings-headless | Concise delegated reports | memory | <source: session learning>
ses_tool-learnings-headless | Verification-gate audit | memory | <source: session learning>
```
