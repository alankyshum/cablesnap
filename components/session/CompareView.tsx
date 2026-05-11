/**
 * CompareView.tsx
 *
 * Side-by-side (1×1 vertical split in portrait, side-by-side in landscape)
 * comparison of two form-check clips with:
 *   - Synchronized Play Both / Pause Both / Reset Both transport
 *   - Swap A ↔ B (key-remount, positions reset)
 *   - In-sheet B picker strip (other clips for the same exercise)
 *   - File-missing placeholder per pane (AC6)
 *   - Sentry_Mask around every VideoView and picker thumbnail (AC11)
 *
 * AC10: Focus order: Close → Swap → A pane → B pane → Picker → Transport.
 * AC12: useMediaSurfaceMounted() called once at root (CompareBody).
 */
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  FlatList,
  Image,
  InteractionManager,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { radii } from "@/constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useMediaSurfaceMounted } from "@/hooks/useMediaSurfaceMounted";
import { toAbsPath, getClipsForExercise } from "@/lib/media/form-clips";
import { getOrCreateThumb } from "@/lib/media/form-clip-thumbs";
import type { SetMediaRow } from "@/lib/db/form-clips";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  isVisible: boolean;
  clipA: SetMediaRow;
  clipB: SetMediaRow | null;
  exerciseId: string;
  /** When false (select-mode entry), picker strip is hidden but "Change" affordance is shown. */
  pickerEnabled?: boolean;
  /** When true, picker strip auto-opens (single-clip player entry). */
  pickerOpen?: boolean;
  onClose: () => void;
};

type State = {
  clipA: SetMediaRow;
  clipB: SetMediaRow | null;
  pickerOpenForSlot: "A" | "B" | null;
};

type Action =
  | { type: "SWAP" }
  | { type: "SET_CLIP"; slot: "A" | "B"; clip: SetMediaRow }
  | { type: "OPEN_PICKER"; slot: "A" | "B" }
  | { type: "CLOSE_PICKER" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SWAP":
      return { ...state, clipA: state.clipB ?? state.clipA, clipB: state.clipA };
    case "SET_CLIP":
      return {
        ...state,
        clipA: action.slot === "A" ? action.clip : state.clipA,
        clipB: action.slot === "B" ? action.clip : state.clipB,
        pickerOpenForSlot: null,
      };
    case "OPEN_PICKER":
      return { ...state, pickerOpenForSlot: action.slot };
    case "CLOSE_PICKER":
      return { ...state, pickerOpenForSlot: null };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function CompareView({
  isVisible,
  clipA: initialClipA,
  clipB: initialClipB,
  exerciseId,
  pickerEnabled = true,
  pickerOpen: pickerOpenProp = false,
  onClose,
}: Props) {
  if (!isVisible) return null;
  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={isVisible}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <CompareBody
        initialClipA={initialClipA}
        initialClipB={initialClipB}
        exerciseId={exerciseId}
        pickerEnabled={pickerEnabled}
        pickerOpenInitial={pickerOpenProp}
        onClose={onClose}
      />
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// CompareBody — rendered inside the Modal so hooks are only active when visible
// ---------------------------------------------------------------------------

type BodyProps = {
  initialClipA: SetMediaRow;
  initialClipB: SetMediaRow | null;
  exerciseId: string;
  pickerEnabled: boolean;
  pickerOpenInitial: boolean;
  onClose: () => void;
};

function CompareBody({
  initialClipA,
  initialClipB,
  exerciseId,
  pickerEnabled,
  pickerOpenInitial,
  onClose,
}: BodyProps) {
  const colors = useThemeColors();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // AC12: replay-gate counter — one increment per sheet open.
  useMediaSurfaceMounted();

  const [state, dispatch] = useReducer(reducer, {
    clipA: initialClipA,
    clipB: initialClipB,
    pickerOpenForSlot: pickerOpenInitial ? "B" : null,
  });

  const [otherClips, setOtherClips] = useState<SetMediaRow[]>([]);

  useEffect(() => {
    if (!pickerEnabled) return;
    InteractionManager.runAfterInteractions(() => {
      getClipsForExercise(exerciseId)
        .then(setOtherClips)
        .catch(() => {});
    });
  }, [exerciseId, pickerEnabled]);

  const pickerClips = useMemo(() => {
    const loadedIds = new Set([state.clipA.id, state.clipB?.id].filter(Boolean));
    return otherClips.filter((c) => !loadedIds.has(c.id));
  }, [otherClips, state.clipA.id, state.clipB?.id]);

  const handleSwap = useCallback(() => dispatch({ type: "SWAP" }), []);
  const handlePickForSlot = useCallback(
    (slot: "A" | "B") => (clip: SetMediaRow) =>
      dispatch({ type: "SET_CLIP", slot, clip }),
    [],
  );
  const handleOpenPicker = useCallback(
    (slot: "A" | "B") => () => dispatch({ type: "OPEN_PICKER", slot }),
    [],
  );
  const handleClosePicker = useCallback(() => dispatch({ type: "CLOSE_PICKER" }), []);

  // Transport refs so we can reach players across panes.
  const playerARef = useRef<ReturnType<typeof useVideoPlayer> | null>(null);
  const playerBRef = useRef<ReturnType<typeof useVideoPlayer> | null>(null);

  const handlePlayBoth = useCallback(() => {
    playerARef.current?.play();
    playerBRef.current?.play();
  }, []);
  const handlePauseBoth = useCallback(() => {
    playerARef.current?.pause();
    playerBRef.current?.pause();
  }, []);
  const handleResetBoth = useCallback(() => {
    if (playerARef.current) playerARef.current.currentTime = 0;
    if (playerBRef.current) playerBRef.current.currentTime = 0;
    playerARef.current?.pause();
    playerBRef.current?.pause();
  }, []);

  const [bothLoaded, setBothLoaded] = useState(false);
  const loadedA = useRef(false);
  const loadedB = useRef(false);
  const checkBothLoaded = useCallback(() => {
    if (loadedA.current && state.clipB !== null && loadedB.current) {
      setBothLoaded(true);
    }
  }, [state.clipB]);

  // Reset loaded state on key-remount (slot change via swap/picker)
  const onALoaded = useCallback(() => {
    loadedA.current = true;
    checkBothLoaded();
  }, [checkBothLoaded]);
  const onBLoaded = useCallback(() => {
    loadedB.current = true;
    checkBothLoaded();
  }, [checkBothLoaded]);
  // Reset on clipA/clipB change
  useEffect(() => {
    loadedA.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBothLoaded(false);
  }, [state.clipA.id]);
  useEffect(() => {
    loadedB.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.clipB === null) setBothLoaded(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.clipB?.id]);

  const paneStyle = isLandscape ? styles.paneLandscape : styles.pane;
  const containerStyle = isLandscape ? styles.containerLandscape : styles.container;

  return (
    // eslint-disable-next-line no-restricted-syntax
    <View style={[containerStyle, { backgroundColor: "#000" }]}>
      {/* Close — focus order: 1 */}
      <Pressable
        style={styles.closeBtn}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close comparison"
      >
        {/* eslint-disable-next-line no-restricted-syntax */}
        <MaterialCommunityIcons name="close" size={28} color="#fff" />
      </Pressable>

      {/* Swap — focus order: 2 */}
      <Pressable
        style={styles.swapBtn}
        onPress={handleSwap}
        accessibilityRole="button"
        accessibilityLabel="Swap clip A and B"
        accessibilityHint="Swaps the two clips. Both clips reset to the beginning and pause."
      >
        {/* eslint-disable-next-line no-restricted-syntax */}
        <MaterialCommunityIcons name="swap-vertical" size={22} color="#fff" />
      </Pressable>

      {/* Panes row */}
      <View style={isLandscape ? styles.panesRowLandscape : styles.panesRowPortrait}>
        {/* Clip A — focus order: 3 */}
        <ClipPane
          key={state.clipA.id}
          clip={state.clipA}
          label="A"
          accessibilityOrder={1}
          onPlayerReady={(p) => { playerARef.current = p; }}
          onLoaded={onALoaded}
          style={paneStyle}
          pickerEnabled={pickerEnabled}
          onChangeTap={handleOpenPicker("A")}
        />
        {/* Divider */}
        {!isLandscape && (
          <View style={[styles.divider, { backgroundColor: colors.outline }]} />
        )}
        {/* Clip B — focus order: 4 */}
        {state.clipB ? (
          <ClipPane
            key={state.clipB.id}
            clip={state.clipB}
            label="B"
            accessibilityOrder={2}
            onPlayerReady={(p) => { playerBRef.current = p; }}
            onLoaded={onBLoaded}
            style={paneStyle}
            pickerEnabled={pickerEnabled}
            onChangeTap={handleOpenPicker("B")}
          />
        ) : (
          <EmptyPane
            label="B"
            style={paneStyle}
            pickerEnabled={pickerEnabled}
            onOpenPicker={handleOpenPicker("B")}
            colors={colors}
          />
        )}
      </View>

      {/* Picker strip — focus order: 5 */}
      {pickerEnabled && state.pickerOpenForSlot !== null && (
        <PickerStrip
          clips={pickerClips}
          slot={state.pickerOpenForSlot}
          onSelect={handlePickForSlot(state.pickerOpenForSlot)}
          onClose={handleClosePicker}
          colors={colors}
        />
      )}

      {/* Transport row — focus order: 6 */}
      <TransportRow
        bothLoaded={bothLoaded}
        onPlayBoth={handlePlayBoth}
        onPauseBoth={handlePauseBoth}
        onResetBoth={handleResetBoth}
        colors={colors}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// ClipPane
// ---------------------------------------------------------------------------

type PaneProps = {
  clip: SetMediaRow;
  label: string;
  accessibilityOrder: number;
  onPlayerReady: (player: ReturnType<typeof useVideoPlayer>) => void;
  onLoaded: () => void;
  style: object;
  pickerEnabled: boolean;
  onChangeTap: () => void;
};

function ClipPane({
  clip,
  label,
  accessibilityOrder,
  onPlayerReady,
  onLoaded,
  style,
  pickerEnabled,
  onChangeTap,
}: PaneProps) {
  const [fileExists, setFileExists] = useState<boolean | null>(null);
  const absPath = toAbsPath(clip.rel_path);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Platform.OS === "web") { setFileExists(true); return; }
    import("expo-file-system").then(({ getInfoAsync }) => {
      getInfoAsync(absPath).then((info) => {
        setFileExists(info.exists);
        if (!info.exists) {
          // AC6 + AC11: log only setId (opaque UUID), never rel_path.
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const Sentry = require("@sentry/react-native") as typeof import("@sentry/react-native");
            Sentry.addBreadcrumb({
              category: "form-clip-compare.missing",
              message: "Clip file not found on disk",
              level: "warning",
              data: { tag: "form-clip-compare.missing", setId: clip.set_id },
            });
          } catch {
            // Non-fatal.
          }
        }
      }).catch(() => setFileExists(false));
    }).catch(() => setFileExists(false));
  }, [absPath, clip.set_id]);

  const player = useVideoPlayer(fileExists === false ? null : { uri: absPath }, (p) => {
    if (p) {
      p.loop = true;
      onPlayerReady(p);
    }
  });

  useEffect(() => {
    if (fileExists === true) onLoaded();
  }, [fileExists, onLoaded]);

  const toggle = useCallback(() => {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player]);

  const dateStr = new Date(clip.created_at).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (fileExists === false) {
    return (
      <View
        style={[style, styles.missingPane]}
        importantForAccessibility="yes"
        accessibilityLabel={`Clip ${label} unavailable`}
      >
        {/* eslint-disable-next-line no-restricted-syntax */}
        <MaterialCommunityIcons name="video-off-outline" size={36} color="#888" />
        <Text style={styles.missingText}>Clip unavailable</Text>
        {pickerEnabled && (
          <Pressable
            style={styles.changeBtn}
            onPress={onChangeTap}
            accessibilityRole="button"
            accessibilityLabel={`Change clip ${label}`}
          >
            {/* eslint-disable-next-line no-restricted-syntax */}
            <Text style={styles.changeBtnText}>Change</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={style} importantForAccessibility="yes" accessibilityViewIsModal={false}>
      <Sentry_Mask>
        <VideoView
          player={player}
          style={styles.video}
          nativeControls={false}
          contentFit="contain"
          accessibilityLabel={`Clip ${label}, recorded ${dateStr}. Clip ${accessibilityOrder} of 2.`}
        />
      </Sentry_Mask>
      {/* Per-pane play/pause overlay */}
      <Pressable
        style={styles.playOverlay}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={player.playing ? `Pause clip ${label}` : `Play clip ${label}`}
      >
        {!player.playing && (
          <View style={styles.playIcon}>
            {/* eslint-disable-next-line no-restricted-syntax */}
            <MaterialCommunityIcons name="play" size={28} color="#fff" />
          </View>
        )}
      </Pressable>
      {/* Date label */}
      <View style={styles.dateLabel} pointerEvents="none">
        <Text style={styles.dateLabelText}>{label} · {dateStr}</Text>
      </View>
      {/* Change affordance (select-mode entry or picker mode) */}
      {pickerEnabled && (
        <Pressable
          style={styles.changeChip}
          onPress={onChangeTap}
          accessibilityRole="button"
          accessibilityLabel={`Change clip ${label}`}
        >
          <Text style={styles.changeChipText}>Change</Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// EmptyPane — slot B not yet filled
// ---------------------------------------------------------------------------

type EmptyPaneProps = {
  label: string;
  style: object;
  pickerEnabled: boolean;
  onOpenPicker: () => void;
  colors: ReturnType<typeof useThemeColors>;
};

function EmptyPane({ label, style, pickerEnabled, onOpenPicker, colors }: EmptyPaneProps) {
  return (
    <View
      style={[style, styles.emptyPane, { backgroundColor: colors.surfaceVariant }]}
      accessibilityLabel={`Slot ${label} empty — tap to pick a clip`}
    >
      {/* eslint-disable-next-line no-restricted-syntax */}
      <MaterialCommunityIcons name="video-plus-outline" size={36} color={colors.onSurfaceVariant} />
      <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
        {pickerEnabled ? "Tap to pick a clip" : `Slot ${label} empty`}
      </Text>
      {pickerEnabled && (
        <Pressable
          style={[styles.changeBtn, { borderColor: colors.primary }]}
          onPress={onOpenPicker}
          accessibilityRole="button"
          accessibilityLabel={`Pick clip for slot ${label}`}
        >
          <Text style={[styles.changeBtnText, { color: colors.primary }]}>Pick clip</Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// PickerStrip — horizontal scrollable list of other clips
// ---------------------------------------------------------------------------

type PickerStripProps = {
  clips: SetMediaRow[];
  slot: "A" | "B";
  onSelect: (clip: SetMediaRow) => void;
  onClose: () => void;
  colors: ReturnType<typeof useThemeColors>;
};

function PickerStrip({ clips, slot, onSelect, onClose, colors }: PickerStripProps) {
  return (
    <View style={[styles.pickerContainer, { backgroundColor: colors.surface }]}>
      <View style={styles.pickerHeader}>
        <Text style={[styles.pickerTitle, { color: colors.onSurface }]}>
          Pick clip for slot {slot}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close clip picker"
        >
          {/* eslint-disable-next-line no-restricted-syntax */}
          <MaterialCommunityIcons name="close" size={20} color={colors.onSurface} />
        </Pressable>
      </View>
      {clips.length === 0 ? (
        <Text style={[styles.pickerEmpty, { color: colors.onSurfaceVariant }]}>
          No other clips available
        </Text>
      ) : (
        <FlatList
          horizontal
          data={clips}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <PickerThumb clip={item} onSelect={onSelect} />
          )}
          contentContainerStyle={styles.pickerList}
          showsHorizontalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// PickerThumb
// ---------------------------------------------------------------------------

function PickerThumb({ clip, onSelect }: { clip: SetMediaRow; onSelect: (c: SetMediaRow) => void }) {
  const [thumbUri, setThumbUri] = useState<string | null>(null);

  useEffect(() => {
    InteractionManager.runAfterInteractions(() => {
      getOrCreateThumb(clip.id, clip.rel_path)
        .then(setThumbUri)
        .catch(() => {});
    });
  }, [clip.id, clip.rel_path]);

  const dateStr = new Date(clip.created_at).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  return (
    <Pressable
      style={styles.thumbItem}
      onPress={() => onSelect(clip)}
      accessibilityRole="button"
      accessibilityLabel={`Select clip from ${dateStr}`}
    >
      <Sentry_Mask>
        {thumbUri ? (
          <Image source={{ uri: thumbUri }} style={styles.thumbImage} />
        ) : (
          <View style={styles.thumbPlaceholder}>
            {/* eslint-disable-next-line no-restricted-syntax */}
            <MaterialCommunityIcons name="video-outline" size={24} color="#888" />
          </View>
        )}
      </Sentry_Mask>
      {/* eslint-disable-next-line no-restricted-syntax */}
      <Text style={styles.thumbDate}>{dateStr}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// TransportRow
// ---------------------------------------------------------------------------

type TransportRowProps = {
  bothLoaded: boolean;
  onPlayBoth: () => void;
  onPauseBoth: () => void;
  onResetBoth: () => void;
  colors: ReturnType<typeof useThemeColors>;
};

function TransportRow({ bothLoaded, onPlayBoth, onPauseBoth, onResetBoth, colors }: TransportRowProps) {
  const disabledHint = "Both clips must be loaded before using transport controls";
  return (
    <View style={[styles.transport, { backgroundColor: colors.surface }]}>
      <TransportBtn
        icon="play"
        label="Play Both"
        onPress={onPlayBoth}
        disabled={!bothLoaded}
        disabledHint={disabledHint}
        colors={colors}
      />
      <TransportBtn
        icon="pause"
        label="Pause Both"
        onPress={onPauseBoth}
        disabled={!bothLoaded}
        disabledHint={disabledHint}
        colors={colors}
      />
      <TransportBtn
        icon="restart"
        label="Reset Both"
        onPress={onResetBoth}
        disabled={!bothLoaded}
        disabledHint={disabledHint}
        colors={colors}
      />
    </View>
  );
}

type TransportBtnProps = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  onPress: () => void;
  disabled: boolean;
  disabledHint: string;
  colors: ReturnType<typeof useThemeColors>;
};

function TransportBtn({ icon, label, onPress, disabled, disabledHint, colors }: TransportBtnProps) {
  return (
    <Pressable
      style={[styles.transportBtn, disabled && styles.transportBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityHint={disabled ? disabledHint : undefined}
    >
      <MaterialCommunityIcons
        name={icon}
        size={24}
        color={disabled ? colors.onSurfaceVariant : colors.onSurface}
      />
      <Text style={[styles.transportLabel, { color: disabled ? colors.onSurfaceVariant : colors.onSurface }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Sentry_Mask
// ---------------------------------------------------------------------------

function Sentry_Mask({ children }: { children: React.ReactNode }) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/react-native") as typeof import("@sentry/react-native");
    // eslint-disable-next-line react-hooks/error-boundaries
    return <Sentry.Mask>{children}</Sentry.Mask>;
  } catch {
    return <>{children}</>;
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/* eslint-disable no-restricted-syntax */
const styles = StyleSheet.create({
  // containers
  container: { flex: 1 },
  containerLandscape: { flex: 1, flexDirection: "column" },
  panesRowPortrait: { flex: 1, flexDirection: "column" },
  panesRowLandscape: { flex: 1, flexDirection: "row" },
  // panes
  pane: { flex: 1, position: "relative" },
  paneLandscape: { flex: 1, position: "relative" },
  // close / swap
  closeBtn: {
    position: "absolute",
    top: 56,
    right: 20,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
  },
  swapBtn: {
    position: "absolute",
    top: 56,
    right: 72,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: radii.pill,
  },
  divider: { height: 2 },
  // video / overlay
  video: { flex: 1 },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  dateLabel: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  // eslint-disable-next-line no-restricted-syntax
  dateLabelText: { color: "#fff", fontSize: 11 },
  // change chip
  changeChip: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  // eslint-disable-next-line no-restricted-syntax
  changeChipText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  // missing pane
  missingPane: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  missingText: { color: "#aaa", fontSize: 14 },
  // empty pane
  emptyPane: { alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 14 },
  // change button (missing / empty pane)
  changeBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 20,
  },
  changeBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  // picker strip
  pickerContainer: { paddingBottom: 8 },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pickerTitle: { fontSize: 13, fontWeight: "600" },
  pickerEmpty: { fontSize: 12, paddingHorizontal: 12, paddingBottom: 8 },
  pickerList: { paddingHorizontal: 8 },
  // thumb
  thumbItem: { marginRight: 8, alignItems: "center", width: 64 },
  thumbImage: { width: 64, height: 96, borderRadius: 6 },
  thumbPlaceholder: {
    width: 64,
    height: 96,
    borderRadius: 6,
    backgroundColor: "#222",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbDate: { color: "#ccc", fontSize: 10, marginTop: 4, textAlign: "center" },
  // transport row
  transport: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  transportBtn: {
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  transportBtnDisabled: { opacity: 0.35 },
  transportLabel: { fontSize: 11 },
});
/* eslint-enable no-restricted-syntax */
