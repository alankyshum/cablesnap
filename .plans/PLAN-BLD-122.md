# Feature Plan: Progress Photos — Visual Body Transformation Tracking

**Issue**: BLD-122
**Author**: CEO
**Date**: 2026-04-15
**Status**: DRAFT → IN_REVIEW (Rev 2)
**Revision**: 2

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1 | 2026-04-15 | Initial draft |
| 2 | 2026-04-15 | Address QD + Techlead review: fix navigation entry point, add privacy controls, specify a11y labels, add soft-delete recovery, clarify compare mode interaction, replace base64 export with zip, add expo-image-manipulator dep, add route registration, specify FlashList |

---

## Problem Statement

CableSnap has body weight and body measurements tracking, but users cannot visually track their physique transformation over time. Visual progress is the **#1 motivator** for fitness consistency — seeing side-by-side before/after photos drives engagement far more than numbers alone.

Every serious fitness app (Strong, JEFIT, Fitbod) includes progress photo tracking. Without it, users must rely on their phone's camera roll, losing the connection between photos and their training data.

**Why now?** Body measurements, nutrition tracking, and workout heatmap are all shipped. Progress photos is the natural next step to complete the "track your body" story alongside body_weight and body_measurements tables.

## User Stories

- As a fitness enthusiast, I want to take dated photos of my physique so that I can see my transformation over weeks and months
- As a user tracking body measurements, I want my photos associated with my measurement dates so I can correlate visual changes with numerical data

## Proposed Solution

### Overview

Add a "Progress Photos" section to the existing Body segment of `app/(tabs)/progress.tsx` that allows users to capture or import photos, tag them by date and pose category, and compare photos side-by-side.

### Privacy Controls (CRITICAL — Rev 2 addition)

Progress photos contain extremely sensitive body images. Privacy is non-negotiable:

1. **Storage isolation**: Photos stored ONLY in app sandbox (`FileSystem.documentDirectory`), never accessible from device gallery or other apps.
2. **First-use privacy notice**: On first photo access, show a modal: "Your progress photos are stored only on this device and never uploaded to any server. Photos are not visible in your device's photo gallery."
3. **Optional section lock**: In Settings, users can enable PIN or biometric (Face ID / fingerprint) authentication to access the Photos section. Uses `expo-local-authentication` (already Expo-managed). When enabled, tapping "Progress Photos" card triggers biometric prompt before navigation.
4. **No cloud sync**: Photos are local-only. Export is explicit and user-initiated.

### UX Design

#### Navigation (FIXED — Rev 2)
- Add "Progress Photos" card to the **body segment** of `app/(tabs)/progress.tsx` — below the existing Measurements card, following the same card pattern (title, subtitle, onPress navigation).
- Tapping the card navigates to `app/body/photos.tsx` — the photo gallery/timeline view.
- **Route registration**: Create `app/body/_layout.tsx` with a Stack navigator registering `photos`, `compare`, and existing `goals` and `measurements` screens. (Addresses known pitfall from BLD-8: "Expo Router: New Screen Files Require Explicit Stack.Screen Registration".)

#### Photo Capture Flow (2 taps to capture)
1. Tap "+" FAB on the photo gallery screen
2. Bottom sheet appears: "Take Photo" | "Choose from Library"
3. After capture/selection → simple metadata form:
   - Date: auto-filled to today (editable via date picker)
   - Pose category: Front / Back / Side Left / Side Right (chip selector, optional)
   - Note: optional short text
4. Show loading/processing overlay during resize + save ("Saving photo...")
5. Photo saved → appears in timeline

#### Photo Gallery (Timeline View)
- Photos displayed in a responsive grid using **FlashList** (already in deps via `@shopify/flash-list`), grouped by month
- Each photo shows date overlay (semi-transparent dark background for contrast) and pose icon
- Long-press a photo → show action menu: "Delete" | "View Full Screen"
- Filter by pose category (chip row at top, with `accessibilityState` for selected state)
- Pagination: load 20 photos at a time with FlashList's `onEndReached`

#### Compare Mode (SPECIFIED — Rev 2)
- **Entry**: Dedicated "Compare" button in the gallery toolbar (top-right, next to filter chips). Button is disabled with `accessibilityHint="Need at least 2 photos to compare"` when < 2 photos exist.
- **Selection**: Tapping "Compare" enters mode selection gallery header shows "Select 2 photos" with a "Cancel" button. Photos get a checkbox overlay. Tapping a photo toggles selection (max 2). 
- **Visual indicator**: Selected photos show a numbered badge (1, 2) with a blue border.
- **Exit without comparing**: Tap "Cancel" in the header to exit selection mode.
- **Same photo twice**: If user taps an already-selected photo, it deselects it.
- **Comparison view**: Once 2 photos are selected, a "Compare" button appears at the bottom. Tapping navigates to `app/body/compare.tsx` with the two photo IDs as route params.
- **Compare screen**: Side-by-side layout (landscape) or top/bottom (portrait). Date labels visible on both photos. Back button returns to gallery.

#### Photo Deletion with Recovery (REVISED — Rev 2)
- **Soft delete**: Deleting a photo marks it as `deleted_at = datetime('now')` in the database. The photo file is NOT immediately removed.
- **Undo snackbar**: After deletion, show a Snackbar (matching existing body weight delete pattern in progress.tsx) with "Photo deleted" + "UNDO" button, 10-second window.
- **Permanent cleanup**: A background cleanup runs on app startup — photos with `deleted_at` older than 30 days are permanently deleted (DB row + file). This matches iOS Photos/Google Photos UX.
- **Deletion atomicity**: On permanent delete — remove DB row first (in transaction), then delete file. On startup, scan for orphaned files (files in photo dir not referenced in DB) and clean them up.

#### Empty State
- Friendly illustration/icon with "Track your transformation" message
- "Take your first progress photo" CTA button
- `accessibilityLabel="No progress photos yet. Tap the button below to take your first photo."`

### Accessibility Specification (ADDED — Rev 2)

Every interactive element must have explicit accessibility attributes:

| Element | accessibilityLabel | accessibilityRole | accessibilityHint |
|---------|-------------------|-------------------|-------------------|
| Photos card (progress.tsx) | "Progress Photos" | "button" | "View and manage your progress photos" |
| FAB (+) | "Add progress photo" | "button" | "Take a new photo or choose from library" |
| Photo grid item | "{Pose} pose photo, {date}" | "button" | "Tap to view full screen, long press for options" |
| Filter chip (e.g. Front) | "Front pose filter" | "togglebutton" | — |
| Compare button | "Compare photos" | "button" | "Select two photos to compare side by side" |
| Delete action | "Delete photo" | "button" | "Move photo to recently deleted" |
| Undo snackbar | "Photo deleted. Undo" | — | "Tap undo to restore the photo" |
| Compare view photo | "{Pose} pose, {date}" | "image" | — |
| Cancel selection | "Cancel photo selection" | "button" | "Exit compare selection mode" |
| Biometric lock toggle | "Require authentication for photos" | "switch" | "When enabled, Face ID or fingerprint is required to view progress photos" |

**Screen reader navigation**: Gallery uses FlashList which supports VoiceOver natively. Section headers ("March 2026") announced as headings. Compare mode announces "Selection mode active, select 2 photos" when entered.

**Date overlays**: Use semi-transparent dark background (`rgba(0,0,0,0.6)`) with white text to ensure WCAG AA contrast ratio regardless of photo content. Font size minimum 12sp.

### Technical Approach

#### Dependencies
- `expo-image-picker` — camera + gallery access (Expo managed)
- `expo-image-manipulator` — deterministic photo resize to max 1200px (REQUIRED, not optional)
- `expo-file-system` — already in the project, used for file I/O
- `expo-local-authentication` — biometric/PIN lock for photo section (Expo managed)
- No other new dependencies

#### Storage Strategy
- Photos stored in the app's document directory (`FileSystem.documentDirectory + 'progress-photos/'`)
- NOT stored in the SQLite database (binary blobs would bloat the DB)
- Database stores metadata only: `id, file_path, capture_date, display_date, pose_category, note, width, height, deleted_at, created_at`
- File names: `{uuid}.jpg` (avoid special characters)
- Thumbnail generation: save a second copy at ~300px for gallery grid performance (`{uuid}_thumb.jpg`)

#### New Database Table
```sql
CREATE TABLE IF NOT EXISTS progress_photos (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  thumbnail_path TEXT,
  capture_date TEXT NOT NULL DEFAULT (datetime('now')),
  display_date TEXT NOT NULL,
  pose_category TEXT,  -- 'front' | 'back' | 'side_left' | 'side_right' | null
  note TEXT,
  width INTEGER,
  height INTEGER,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_progress_photos_display_date ON progress_photos(display_date);
CREATE INDEX idx_progress_photos_deleted ON progress_photos(deleted_at);
```

Note: `capture_date` is the actual timestamp of photo capture. `display_date` is the user-editable date (defaults to today, user can change to backdate).

#### Route Registration (ADDED — Rev 2)
Create `app/body/_layout.tsx`:
```tsx
import { Stack } from "expo-router";
export default function BodyLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="goals" options={{ title: "Body Goals" }} />
      <Stack.Screen name="measurements" options={{ title: "Measurements" }} />
      <Stack.Screen name="photos" options={{ title: "Progress Photos" }} />
      <Stack.Screen name="compare" options={{ title: "Compare Photos" }} />
    </Stack>
  );
}
```

#### New Files
- `app/body/_layout.tsx` — Stack navigator for body routes
- `lib/db/photos.ts` — CRUD operations for progress_photos table
`app/body/photos.tsx` - photo gallery/timeline screen (SafeAreaView wrapped) 
- `app/body/compare.tsx` — side-by-side comparison screen (SafeAreaView wrapped)
- `components/PhotoGrid.tsx` — responsive photo grid component using FlashList
- `__tests__/lib/db/photos.test.ts` — database operation tests

#### Modified Files
- `lib/db/helpers.ts` — add progress_photos table creation in migration
- `app/(tabs)/progress.tsx` — add "Progress Photos" card in body segment
- `lib/schemas.ts` — add photo export/import schema
- `lib/db.ts` — re-export photo functions

#### Photo Processing
- Resize captured photos to max 1200px on longest edge using `expo-image-manipulator`
- Generate thumbnail at 300px on longest edge for gallery grid
- JPEG compression at 80% quality for full, 60% for thumbnail
- Store original aspect ratio in DB (width/height) for proper rendering
- Show loading overlay during processing ("Saving photo...")

#### Export/Import (REVISED — Rev 2)
- **Default JSON export**: Photo metadata only (id, dates, pose, note). No binary data.
- **Full photo export**: ZIP archive using `expo-file-system` — contains `photos-metadata.json` + individual JPEG files in a `photos/` directory. User explicitly opts in via a toggle: "Include photos (adds ~X MB)".
- **Import**: Reads ZIP archive, extracts photos to document directory, inserts metadata into DB.
- This avoids the OOM risk of base64-encoding 50+ photos into a single JSON string.

### Scope

**In Scope:**
- Photo capture (camera) and import (gallery)
- Photo gallery with month-grouped timeline using FlashList
- Photo metadata (capture date, display date, pose category, note)
- Thumbnail generation for gallery performance
- Side-by-side comparison of two photos with explicit selection UX
- Soft-delete with 30-day recovery + undo snackbar
- Orphan file cleanup on app startup
- Filter by pose category
- Responsive layout (phone + tablet — 3 columns phone, 4 columns tablet)
- Full accessibility labels and roles per specification table
- Privacy controls (sandbox storage, first-use notice, optional biometric lock)
- ZIP-based photo export/import
- SafeAreaView on all new screens
- Loading states for capture, resize, save, and gallery loading
- Empty state UX
- Route registration via `app/body/_layout.tsx`

**Out of Scope:**
- Video recording
- Photo editing/filters/annotations
- Cloud backup/sync
- Automatic pose detection (ML)
- Body part cropping/overlay
- Sharing photos to social media
- Import from other fitness apps (v2 consideration)
- Swipe-to-cycle in compare mode (v2 — adds gesture complexity)

### Acceptance Criteria

- [ ] Given I am on the Body segment of Progress tab, When I see the cards, Then a "Progress Photos" card appears below Measurements
- [ ] Given I tap "Progress Photos" card, When biometric lock is OFF, Then the photo gallery screen opens directly
- [ ] Given I tap "Progress Photos" card, When biometric lock is ON, Then biometric prompt appears first; gallery opens only on success
- [ ] Given I am on the gallery, When I tap the "+" FAB and choose "Take Photo", Then the camera opens and I can capture a photo that appears in the gallery after a loading indicator
- [ ] Given I am on the gallery, When I tap the "+" FAB and choose "From Library", Then the image picker opens and I can select a photo
- [ ] Given I have captured a photo, When I set the display date and pose category, Then the photo is saved with that metadata and both capture_date and display_date are stored
- [ ] Given I have 2+ photos, When I tap "Compare" and select two photos, Then they display side-by-side with date labels
- [ ] Given I am in compare selection mode, When I tap "Cancel", Then selection mode exits without navigating
- [ ] Given I long-press a photo and tap "Delete", Then the photo is soft-deleted, a Snackbar with "UNDO" appears for 10 seconds
- [ ] Given I tap "UNDO" on the delete Snackbar, Then the photo reappears in the gallery
- [ ] Given a photo was soft-deleted 31 days ago, When the app starts, Then the photo file and DB row are permanently removed
- [ ] Given I have photos from multiple months, When viewing the gallery, Then photos are grouped by month with section headers
- [ ] Given I filter by pose "Front", When viewing the gallery, Then only front-pose photos are shown
- [ ] Given I have no photos, When viewing the gallery, Then the empty state message and CTA button are shown
- [ ] Given I export data as ZIP with photos included, When I import on another device, Then photos and metadata are restored
- [ ] Given this is my first time accessing Photos, When the gallery opens, Then a one-time privacy notice modal appears
- [ ] PR passes all tests with no regressions
- [ ] No new lint warnings
- [ ] Every interactive element has accessibilityLabel per the specification table
- [ ] Camera/gallery permissions are requested at the moment of use, not on app launch
- [ ] All new screens wrapped in SafeAreaView

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Camera permission denied | Show explanation text and "Open Settings" button |
| Gallery permission denied | Show explanation text and "Open Settings" button |
| Very large photo (>10MB) | Resize to max 1200px before saving; show loading overlay |
| 100+ photos in gallery | FlashList with pagination (20 at a time), thumbnails for perf |
| Photo file missing (deleted externally) | Show placeholder with "Photo not found" text; allow metadata deletion |
| Compare with only 1 photo | "Compare" button disabled with accessibilityHint explaining why |
| Tablet layout | Grid shows 4 columns instead of 3; compare view uses side-by-side |
| Dark mode | Photo thumbnails have subtle border; date overlays use dark bg + white text |
| ZIP export with 50+ photos | Progress indicator during export; show estimated file size before starting |
| Display date set to future | Allow but show warning "Future date selected" |
| App reinstall / device change | Photos are lost (local-only). Privacy notice mentions this. Export/import is the recovery mechanism. |
| Storage space full | Catch write error, show "Not enough storage space" alert |
| Photo EXIF orientation | `expo-image-manipulator` normalizes orientation during resize |
| Rapid consecutive captures | Saves are serialized via async queue — each completes before the next starts |
| iOS "selected photos" permission | Respect limited library access; picker works correctly in both modes |
| Photo taken during active workout | Photos screen is a separate route; navigating away doesn't affect workout timer (timers run in background via state) |
| Biometric auth failure | Show "Authentication failed" with "Try Again" button; do not navigate to gallery |
| Orphaned files on startup | Scan photo dir, delete files not referenced in DB (excluding soft-deleted entries within 30 days) |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Storage bloat from photos | Medium | Medium | Resize to 1200px max + thumbnails, JPEG compression |
| Slow gallery loading | Low | Medium | FlashList + thumbnails + pagination |
| Permission UX confusion | Medium | Low | Request at moment of use, clear error messages |
| Export file too large | Medium | Medium | ZIP format, progress indicator, opt-in toggle |
| expo-image-picker breaking changes | Low | Low | Expo managed workflow handles updates |
| Privacy concerns | High | High | Sandbox storage, no cloud, biometric lock option, privacy notice |
| Data loss on reinstall | Medium | Medium | Clear warning in privacy notice, ZIP export as backup |

## Review Feedback

### Quality Director (UX Critique)
**Rev 1**: NEEDS REVISION — 5 critical issues (privacy, navigation, a11y, delete recovery, compare mode). See comment.
**Rev 2**: APPROVED — All 5 critical issues resolved. Privacy controls, navigation, accessibility, delete recovery, compare mode all well-specified. Implementation may proceed.

### Tech Lead (Technical Feasibility)
**Rev 1**: NEEDS REVISION — 4 critical issues (entry point, base64 export, missing dep, route registration). See comment.
**Rev 2**: APPROVED — All 4 issues resolved. Entry point corrected to `progress.tsx`, base64 export replaced with ZIP archive, `expo-image-manipulator` explicitly listed as dependency, route registration via `app/body/_layout.tsx` specified. Minor recommendations (FlashList, orphan cleanup, thumbnails, scope trim) also incorporated. Technically sound — ready for implementation.

### CEO Decision
**APPROVED** — Both QD and Techlead approved Rev 2. Plan is ready for implementation. Note: verify expo-local-authentication + expo-image-manipulator Expo SDK compatibility during implementation.
