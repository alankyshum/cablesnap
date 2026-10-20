---
id: body
title: Body Metrics, Goals, and Progress Photos
aliases: ["body weight", "measurements", "body fat", "progress pictures", "before and after", "weight goal", "body profile"]
routes: ["/body/compare", "/body/goals", "/body/measurements", "/body/photos"]
paths: ["app/body/**", "components/photos/**", "components/PhotoGrid.tsx", "components/BodyProfileCard.tsx", "components/BodyProfileForm.tsx", "hooks/useBodyMetrics.ts", "hooks/useBodyProfile.ts", "hooks/usePhotoActions.ts", "lib/db/body.ts", "lib/db/photos.ts"]
---
# Body Metrics, Goals, and Progress Photos

Body weight/composition and circumference logs, goals, private progress photos, and photo comparison.

## Sub-features
- Measurements, weight/body-fat goals, photo metadata/privacy/filtering, side-by-side comparison.

## How to get to it (user POV)
- Open **Progress → Body** for body cards and links to measurements/photos/goals.
- Profile basics are also editable from **Settings → Profile**.

## Code entry points
- `app/body/` — dedicated body screens.
- `hooks/useBodyMetrics.ts` and `lib/db/body.ts` — metric reads/writes.
- `components/photos/` + `lib/db/photos.ts` — photo workflows.

## Gotchas
- Photos are local/private media and backup exclusions matter; respect weight and measurement units.
