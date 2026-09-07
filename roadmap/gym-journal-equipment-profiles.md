---
status: unimplemented
---

# Gym Journal and Equipment Profiles

## Goals

- Let users correct and complete the equipment details recognized from a gym photo.
- Let users save a recognizable gym profile under a custom name.
- Preserve a useful history of gyms the user has visited.

## User flow

1. AI recognizes a gym photo and presents the detected gym and equipment details.
2. The user reviews and edits properties such as dumbbell count, weight range, increment steps, resistance-band options, and comparable equipment details.
3. The user saves the gym under a custom name and attaches the photo to that saved gym.
4. Later, the user can recognize or select the saved gym and review its profile and visit journal/history.

## Likely data concepts

- Saved gym: custom name, user-edited equipment properties, and recognition details.
- Equipment profile: counts, ranges, increments, resistance-band options, and comparable equipment notes.
- Attached gym photo and its relationship to the saved gym.
- Visit journal/history entries with a gym reference and visit context.

## Acceptance criteria

- Users can review and edit AI-recognized gym and equipment properties before saving.
- The profile supports dumbbell count, weight range, increment steps, resistance-band options, and comparable equipment details.
- Users can save a gym with a custom name and attach its source photo.
- A saved gym can be recognized or selected later, with its edited profile and attached photo available.
- Users can maintain and review a history of gyms visited.

## Privacy

Stored gym photos are user data. The product must clearly communicate where they are stored, who can access them, and how users can remove them; do not retain or share them beyond the user's control without consent.
