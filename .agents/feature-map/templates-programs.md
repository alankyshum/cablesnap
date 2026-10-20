---
id: templates-programs
title: Workout Templates and Programs
aliases: ["routine", "workout template", "program builder", "training plan", "schedule", "pick template", "starter plan"]
routes: ["/program/[id]", "/program/create", "/program/pick-template", "/template/[id]", "/template/create"]
paths: ["app/program/**", "app/template/**", "components/program/**", "components/template/**", "components/SaveAsTemplateSheet.tsx", "hooks/useProgramDetail.ts", "hooks/useTemplateEditor.ts", "lib/programs.ts", "lib/curated-programs.ts", "lib/starter-templates.ts", "lib/db/templates.ts", "lib/db/training-day-workout.ts"]
---
# Workout Templates and Programs

Reusable workouts and multi-day training programs, including starter content and weekly schedules.

## Sub-features
- Create/edit/import/export templates; program days, extras, history, and scheduling.

## How to get to it (user POV)
- On **Workouts**, switch between **Templates** and **Programs**; use add/options menus.
- Open a program, add a day, then pick or create a template.

## Code entry points
- `app/template/` — template editor screens.
- `app/program/` + `components/program/` — program builder and schedule.
- `lib/db/templates.ts` and `lib/programs.ts` — persistence/domain behavior.

## Gotchas
- Starter items have special metadata; deleting or importing affects home queries and program references.
