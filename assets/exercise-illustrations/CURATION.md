# Exercise Illustration Curation — BLD-561

Two-gate review for every pilot exercise image pair. Per R2 plan:

- **Visual plausibility** — no extra limbs, no text artifacts, style consistent.
- **Technique** — cable path matches `mount_position` + `attachment`; joint angles plausible; no injury-risk poses.

Both gates must be ✅ before an image pair ships in `manifest.generated.ts`.
If either gate is ❌ or missing, the exercise is **excluded from the manifest** and
`resolveExerciseImages()` returns `null` (both-or-neither rule) — user sees text steps only.

## Provider

- Model: `gpt-image-1` (OpenAI). Commercial-rights ToS clean.
- Image spec: 384×384 webp Q75, transparent alpha background.
- Generator: `scripts/generate-exercise-images.ts`.

## Status

**Pipeline landed in PR1 (BLD-561). Pilot image generation is pending a run of
`npm run generate:exercise-images` with `OPENAI_API_KEY` present.**

Run from an environment with the key set (owner device or CI secret):

```bash
export OPENAI_API_KEY=sk-...
npm run generate:exercise-images
# then paste review--sports-science output below per exercise
# and sign off visual + technique gates
```

The pilot manifest is intentionally empty in PR1 so the both-or-neither rule
keeps every Voltra exercise at text-only until a curator has signed off on
the generated images. Shipping the pipeline + renderer ahead of the image
batch lets the renderer and bundle gate be reviewed independently of
model-output quality.

## Pilot batch sign-off template

For each pilot exercise, append a block below:

```
## voltra-XXX — <Exercise Name>
- Visual plausibility: ✅/❌ <reviewer> <date> (notes)
- Technique: ✅/❌ <reviewer> <date> (notes)
- Model: gpt-image-1 <model-version>
- review--sports-science: <paste skill output here, include commit hash / timestamp>
- Regeneration notes: <N regens, what changed>
```

Note: reviewer handles `alan` and `alankyshum` are equivalent per techlead.

## Pilot exercise list (10)

See `assets/exercise-illustrations/pilot-ids.ts`:

1. voltra-001 — Abdominal Crunches (low mount, 2-arm)
2. voltra-013 — Bicep Curls (low mount, 2-arm)
3. voltra-029 — Chest Press (mid mount, 2-arm)
4. voltra-045 — Lat Pulldown (high mount, 2-arm)
5. voltra-003 — Half Kneeling Chop (high mount, 1-arm diagonal)
6. voltra-005 — One-arm Chest Fly with Rotation (mid mount, 1-arm)
7. voltra-007 — Single Arm Chest Press with Spinal Rotation (mid mount, 1-arm)
8. voltra-010 — (low-mount coverage)
9. voltra-020 — (mid-mount coverage)
10. voltra-035 — (high-mount 1-arm coverage)

## Sign-offs

_None yet — awaiting first generator run with `OPENAI_API_KEY`._
