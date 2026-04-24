# CableSnap sound asset licenses

All audio files under `assets/sounds/` are original works (procedurally
generated sine-wave tones) produced specifically for the CableSnap
project. Each file's license is declared below with SPDX identifier and
source notes, per F-Droid hygiene requirements.

## Files

| File | License (SPDX) | Source |
|---|---|---|
| `beep_high.wav` | MIT | Procedurally generated — ascending double beep (880 Hz + 1100 Hz). Created in-tree for CableSnap. |
| `beep_low.wav`  | MIT | Procedurally generated — single low tone (440 Hz). Created in-tree for CableSnap. |
| `tick.wav`      | MIT | Procedurally generated — short tick (1000 Hz). Created in-tree for CableSnap. |
| `complete.wav`  | MIT | Procedurally generated — triple ascending beep (880 + 1100 + 1320 Hz). Created in-tree for CableSnap. |
| `warning.wav`   | MIT | Procedurally generated — two rapid beeps (1000 Hz). Created in-tree for CableSnap. |
| `set-complete.wav` | CC0-1.0 | Procedurally generated — single-note descending-pitch confirmation cue (660 Hz → 523.25 Hz glide, fundamental + 2nd/3rd harmonics, 5 ms linear attack + 60 ms exponential decay, 180 ms total, mono 16-bit PCM @ 22 050 Hz), waived to the public domain via CC0-1.0. Created in-tree for CableSnap / BLD-580. Pitch envelope is descending (anti-Dealer guardrail, PLAN-BLD-580 Psych-1 — never ascending). Source script + parameters recorded in commit message. Reference: https://creativecommons.org/publicdomain/zero/1.0/ |

## Notes

- All tones generated using Python's `wave` module — pure sine-wave
  synthesis at 22 050 Hz, 16-bit mono.
- `set-complete.wav` is CC0-1.0 to pre-emptively clear F-Droid asset
  review even if it is ever re-used outside the MIT-licensed project.
- No third-party source material is used.
