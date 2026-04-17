# Feasibility Study: Wear OS Workout Tracking Integration

**Issue**: BLD-300 (GitHub #166)
**Author**: CEO
**Date**: 2026-04-17
**Status**: COMPLETE (Exploration — no implementation planned)

## Problem Statement

During a workout, pulling out a phone to log each set is disruptive. A Wear OS companion app would let users quickly input weight/reps and advance to the next exercise hands-free from their wrist.

## Research Findings

### 1. React Native / Expo on Wear OS — NOT VIABLE

**React Native and Expo do not support Wear OS.** This is the most critical finding:

- Expo managed workflow targets iOS and Android phones/tablets only. There is no Wear OS build target.
- React Native has no official Wear OS support. While APKs can technically be side-loaded onto Wear OS (it's Android), the result is unusable:
  - UI components are not optimized for round/small screens
  - No access to Wear OS-specific APIs (Tiles, Complications, Crown input, Always-On Display)
  - Performance is poor on watch hardware
  - No community libraries of substance exist for this path
- This limitation is structural and unlikely to change in any relevant timeframe.

**Verdict: A Wear OS app CANNOT share code with the existing FitForge Expo/React Native codebase.**

### 2. Required Tech Stack — Native Kotlin

A Wear OS companion app must be built as a **separate native Kotlin project** using:

| Component | Technology |
|-----------|-----------|
| UI Framework | Compose for Wear OS (Google's official, declarative) |
| Language | Kotlin |
| Build System | Gradle |
| Communication | Wearable Data Layer API (MessageClient + DataClient) |
| Local Storage | Room (SQLite wrapper for Android) |
| Input Methods | Crown rotation, touch, voice (Google Assistant) |

This is an entirely separate codebase, build pipeline, and deployment target.

### 3. Architecture — Phone ↔ Watch Communication

```
┌─────────────────┐         Bluetooth/Wi-Fi         ┌─────────────────┐
│   FitForge App  │ ◄─────── Data Layer API ──────► │  Wear OS App    │
│  (Expo/RN)      │         MessageClient            │  (Kotlin)       │
│                 │         DataClient                │                 │
│  SQLite DB      │                                   │  Room DB        │
│  (source of     │                                   │  (sync cache)   │
│   truth)        │                                   │                 │
└─────────────────┘                                   └─────────────────┘
```

**Communication flow:**
1. User starts a workout session on the phone → phone sends session data (exercises, target sets/reps) to watch via DataClient
2. Watch displays current exercise → user inputs weight/reps via crown or touch
3. Watch sends completed set data back to phone via MessageClient
4. Phone's SQLite DB remains the source of truth
5. Watch has a Room DB cache for offline resilience

**Key challenge:** FitForge uses Expo managed workflow. Integrating the Wearable Data Layer API requires:
- Either **ejecting from Expo** to bare workflow (to add native Android modules)
- Or building the watch communication as a **standalone Android service** that shares data via a different mechanism (e.g., local HTTP, shared file, or content provider)

Neither is straightforward. Ejecting from Expo would be a major architectural change affecting the entire project.

### 4. Minimal Watch UI Design

Given the ~1.4" round screen, the UI must be extremely minimal:

**Screen 1 — Exercise Display**
```
┌─────────────┐
│  Bench Press │
│   Set 2/4    │
│              │
│  [Log Set]   │
└─────────────┘
```

**Screen 2 — Weight Input** (crown rotation to scroll)
```
┌─────────────┐
│   Weight     │
│    ▲         │
│   82.5 kg   │
│    ▼         │
│  [Confirm]   │
└─────────────┘
```

**Screen 3 — Reps Input** (crown rotation)
```
┌─────────────┐
│    Reps      │
│    ▲         │
│     8        │
│    ▼         │
│  [Done ✓]   │
└─────────────┘
```

**Input methods:**
- Crown/bezel rotation: scroll through weight/reps values
- Touch: confirm selections, navigate between exercises
- Voice (optional): "12 reps at 80 kilos"

### 5. Offline Support & Data Sync

| Scenario | Behavior |
|----------|----------|
| Phone connected | Real-time sync via MessageClient |
| Phone disconnected (mid-workout) | Watch stores sets locally in Room DB |
| Phone reconnects | Watch syncs queued sets via DataClient |
| Watch-only workout (no phone) | Full offline mode; sync when phone found |

The Data Layer API handles connection state automatically. DataClient items persist until consumed, making it reliable for workout data that must not be lost.

### 6. Technical Constraints

| Constraint | Impact |
|-----------|--------|
| Screen size (~1.4" round) | Only 1-2 data points visible at a time |
| Battery life | Workout sessions must be power-efficient; no continuous rendering |
| RAM (~512MB-1GB) | Lightweight app required |
| No Expo integration | Separate native codebase, separate build/deploy |
| Google Play Services required | Data Layer API needs Play Services on both devices |
| Wear OS 3+ minimum | Older watches excluded |
| Expo ejection or bridge needed | Phone-side integration is non-trivial |

### 7. Effort Estimate

| Work Item | Estimate | Notes |
|-----------|----------|-------|
| Wear OS app scaffold (Kotlin + Compose) | 2-3 weeks | New project, build pipeline, CI |
| Watch UI (3-4 screens) | 1-2 weeks | Exercise view, weight input, reps input, session summary |
| Data Layer integration (watch side) | 1-2 weeks | MessageClient + DataClient + Room DB |
| Phone-side bridge (Expo → native) | 2-4 weeks | **Hardest part** — requires Expo ejection or custom native module |
| Offline sync & conflict resolution | 1-2 weeks | Queue management, retry logic |
| Testing on real hardware | 1-2 weeks | Need physical Wear OS device |
| **Total** | **8-15 weeks** | Assumes one engineer, full-time |

### 8. Alternative Approaches Considered

| Alternative | Pros | Cons | Verdict |
|-------------|------|------|---------|
| Flutter companion app | Better Wear OS support than RN | Entirely new tech stack for BLD, no code sharing | ❌ Same effort, different language |
| PWA on Wear OS browser | Uses existing web tech | Extremely limited API access, no offline, poor UX | ❌ Not viable |
| Bluetooth direct (skip Data Layer) | No Expo ejection needed | Complex pairing, unreliable, reinventing the wheel | ❌ Bad DX |
| Apple Watch only (watchOS) | React Native has better watchOS bridges | Excludes Android users, still requires native code | ❌ Platform lock-in |
| Expo eject → bare workflow | Full native module access | Breaks managed workflow benefits (OTA updates, EAS Build simplicity) | ⚠️ High cost |
| Standalone companion APK + REST API | No Expo changes needed, watch talks to phone via localhost HTTP | Requires phone app to run a local server; power-hungry, fragile | ❌ Fragile |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Expo ejection destabilizes phone app | High | Critical | Defer ejection; explore native module bridge first |
| No Wear OS test device available | Medium | High | Use Android emulator (limited fidelity) |
| Kotlin expertise gap in team | High | High | All BLD agents specialize in TypeScript/React Native |
| Battery drain on watch | Medium | Medium | Minimize renders, use ambient mode |
| Data sync conflicts | Low | Medium | Phone DB is always source of truth |
| Maintenance burden of two codebases | High | High | Ongoing cost — every feature needs watch-side updates |

## Recommendation

### 🔴 DO NOT PROCEED with Wear OS integration at this time.

**Rationale:**
1. **Entirely separate codebase required** — Kotlin/Compose for Wear OS shares zero code with the Expo/React Native phone app. This doubles the maintenance surface.
2. **Expo ejection risk** — Phone-side integration requires either ejecting from Expo managed workflow (high-risk architectural change) or building a fragile bridge.
3. **Skill gap** — BLD's engineering team specializes in TypeScript/React Native. Kotlin/Compose for Wear OS requires completely different expertise.
4. **8-15 weeks of effort** — This is a major investment for a feature that serves only the subset of users with Wear OS watches.
5. **Ongoing maintenance cost** — Every new FitForge feature (new set types, exercises, programs) would need parallel implementation on the watch.

### Suggested Alternatives (Lower Effort, Broader Impact)

1. **Keep-awake + quick-input optimization** (1-2 days): The app already uses `expo-keep-awake`. Optimize the set logging UI for one-handed, glanceable use during workouts. Larger touch targets, auto-advance to next set, haptic confirmation.

2. **Notification-based logging** (2-3 weeks): Use Android notifications with action buttons to log sets without opening the app. "Set 2: Bench Press — [✓ Done] [Skip]". Works on both phone AND watch (notifications mirror to Wear OS automatically).

3. **Google Fit / Health Connect integration** (1-2 weeks): Sync completed workouts to Google Health Connect. Many fitness watches already display this data. Lower effort, broader device support.

4. **Revisit when Expo supports Wear OS** — If Expo or React Native ever adds Wear OS as a build target, reassess. Until then, the effort-to-value ratio is prohibitive.

## Conclusion

Wear OS integration is technically feasible but economically impractical for FitForge's current stage. The required investment (separate Kotlin codebase, Expo ejection, ongoing dual-maintenance) far outweighs the benefit for the user segment it serves. The notification-based approach would deliver 70% of the value at 10% of the cost.
