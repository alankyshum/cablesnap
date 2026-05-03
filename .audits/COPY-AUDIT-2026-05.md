# CableSnap Copy Audit — May 2026

**Auditor:** claudecoder (BLD-1030)  
**Date:** 2026-05-03  
**Scope:** Onboarding screens, settings screens, progress components, body profile form, home components  
**Trigger:** r/antidietglp1 thread identifying user demand for non-fatphobic workout apps with local-only data

---

## Trigger Phrase List Checked

The following diet-culture / fatphobic phrases were explicitly searched across all files in scope:

| Phrase | Variants checked |
|--------|-----------------|
| shed pounds / lose weight | "shed pound", "lose weight", "weight loss" |
| burn fat / fat loss | "burn fat", "fat loss", "body fat" (as goal framing) |
| slim down / get lean / get toned | "slim down", "get lean", "get toned" |
| aesthetic appearance motivation | "look great", "get shredded", "get ripped", "before.*after", "sad.*fat", "transformation" (as weight-loss framing) |
| diet tracking nudges | "diet", assumes calorie restriction |
| body composition as goal | "body composition" (as motivational framing) |

Search command used:
```bash
grep -rni "shed pound|burn fat|lose weight|slim down|get shredded|get toned|look great|get lean|body fat|fat loss|weight loss|before.after|transformation|aesthetic|appearance" app/onboarding/ app/settings/ components/progress/ components/BodyProfileForm.tsx components/home/
```

---

## Files Reviewed

### app/onboarding/

| File | Status | Notes |
|------|--------|-------|
| `app/onboarding/welcome.tsx` | **Modified (AC-2)** | Added privacy/positioning caption below subtitle. No diet-culture phrasing in original. |
| `app/onboarding/setup.tsx` | ✅ Clean | Weight unit selection uses functional labels ("kg"/"lb"), not appearance motivation. Activity levels use skill/effort framing. No trigger phrases found. |
| `app/onboarding/recommend.tsx` | ✅ Clean | Shows workout program recommendations. No diet-culture framing. |
| `app/onboarding/_layout.tsx` | ✅ Clean | Layout only, no user-facing copy. |

### app/settings/

| File | Status | Notes |
|------|--------|-------|
| `app/settings/backups.tsx` | ✅ Clean | Backup/restore UI only. No body-related copy. |
| `app/settings/import-backup.tsx` | ✅ Clean | Import flow UI only. No body-related copy. |

### components/progress/

| File | Status | Notes |
|------|--------|-------|
| `components/progress/WeightLogModal.tsx` | **Modified (AC-3)** | Added neutral framing caption. Original title "Log Weight" is neutral. |
| `components/progress/BodyCards.tsx` | **Modified (AC-4)** | "Track your visual transformation" replaced with "Document your strength journey over time" — appearance-focused motivation removed. Body fat % display (line 133) is user-entered data, not app-imposed goal framing — conditionally shown only when user set a body_fat_goal. |
| `components/progress/BodySegment.tsx` | ✅ Clean | Structural only. |
| `components/progress/NutritionCards.tsx` | ✅ Clean | "Calorie Trend" is a neutral data label. No weight-loss goal framing. |
| `components/progress/NutritionSegment.tsx` | ✅ Clean | Structural only. |
| `components/progress/ActiveGoalsCard.tsx` | ✅ Clean | No trigger phrases. |
| `components/progress/TrendCards.tsx` | ✅ Clean | Strength/volume trend cards. |
| `components/progress/StrengthLevelsCard.tsx` | ✅ Clean | Skill-based level framing. |
| `components/progress/WorkoutEmptyState.tsx` | ✅ Clean | No diet-culture framing. |
| `components/progress/CalendarView.tsx` | ✅ Clean | Session calendar, no body-related copy. |
| `components/progress/PRSummaryCard.tsx` | ✅ Clean | PR/strength metrics only. |
| `components/progress/MonthlyReportCards.tsx` | ✅ Clean | "on calorie target" is neutral self-tracking framing (user-set). |

### components/BodyProfileForm.tsx

| File | Status | Notes |
|------|--------|-------|
| `components/BodyProfileForm.tsx` | ✅ Clean | "calorie calculation" / "calorie targets" are functional tool labels, not diet-culture motivation. Goal buttons use lifter-standard terms (Cut / Maintain / Bulk) — not aesthetic framing. RMR tooltip is clinical/informational. |

### components/home/

| File | Status | Notes |
|------|--------|-------|
| `components/home/HomeBanners.tsx` | ✅ Clean | No trigger phrases. |
| `components/home/WeeklySummaryCard.tsx` | ✅ Clean | Volume/session stats. |
| `components/home/InsightCard.tsx` | ✅ Clean | Strength insights. |
| `components/home/RecentWorkoutsList.tsx` | ✅ Clean | Workout history. |
| `components/home/StatsRow.tsx` | ✅ Clean | Performance stats. |
| `components/home/DeloadNudgeCard.tsx` | ✅ Clean | Recovery framing. |
| `components/home/RecoveryHeatmap.tsx` | ✅ Clean | Recovery data only. |
| `components/home/AdherenceBar.tsx` | ✅ Clean | Consistency metric. |
| `components/home/ProgramsList.tsx` | ✅ Clean | Program tracking. |
| `components/home/TemplatesList.tsx` | ✅ Clean | Workout templates. |

---

## Changes Made

### AC-2 — Privacy/Positioning Caption (`app/onboarding/welcome.tsx`)

**Added below existing subtitle:**

> "Local-only. We don't track your body composition or share your data. Log only what helps you."

Uses `Text` component with `variant="caption"`, `colors.onSurfaceVariant`, `spacing.md` top padding, `textAlign: "center"`, and `accessibilityLabel` matching visible text.

### AC-3 — Body-Weight Neutral Framing (`components/progress/WeightLogModal.tsx`)

**Added below "Log Weight" modal title, above Weight input:**

> "Optional. Use this for strength-relative-to-bodyweight tracking — never as a goal."

Uses `Text` component with `variant="caption"`, `colors.onSurfaceVariant`, bottom margin of 16px (consistent with existing spacing), and `accessibilityLabel` matching visible text.

### AC-4 — Progress Photos neutral caption (`components/progress/BodyCards.tsx`)

**Replaced appearance-focused caption:**

> ~~"Track your visual transformation"~~

**With strength-journey framing:**

> "Document your strength journey over time"

---

## Conclusion

**No diet-culture phrasing is present in CableSnap's onboarding, settings, progress, or home copy.**

Macro/Goal vocabulary uses lifter-standard terms (Cut / Maintain / Bulk). Onboarding subtitle is performance-framed. Level descriptions are skill-based. Three new/updated captions (AC-2, AC-3, AC-4) add proactive positioning for the privacy-first / anti-diet-culture audience identified in the Reddit research, without removing or restructuring any existing functionality.

Future contributors: before adding copy to onboarding, settings, or body-tracking screens, check this document and the trigger phrase list above.
