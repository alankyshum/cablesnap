/**
 * lib/media/form-clip-thumbs.ts
 *
 * BLD-1151 AC13: Thumbnail cache for form-check clips shown in the CompareView
 * picker strip.
 *
 * - Writes only under `${FileSystem.Paths.cache}/form-clip-thumbs/`
 * - LRU eviction when cumulative size > 25 MB
 * - Caps concurrent getThumbnailAsync calls at 3 (inline semaphore — no p-limit dep)
 * - `purgeThumb(setId)` invoked from softDeleteClip and reconcileOrphans
 * - `getThumbnailAsync` is lazy-loaded inside getOrCreateThumb to avoid
 *   native-module errors in Jest environments that don't run FormClipsPlayer.
 */

import { File, Directory, Paths } from "expo-file-system";
import { toAbsPath } from "@/lib/media/set-media-common";

// ---------------------------------------------------------------------------
// Inline concurrency semaphore (replaces p-limit)
// ---------------------------------------------------------------------------

function createSemaphore(maxConcurrent: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  function next() {
    if (running >= maxConcurrent || queue.length === 0) return;
    running++;
    const fn = queue.shift()!;
    fn();
  }

  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(async () => {
        try {
          resolve(await task());
        } catch (err) {
          reject(err);
        } finally {
          running--;
          next();
        }
      });
      next();
    });
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THUMBS_SUBDIR = "form-clip-thumbs";
const MAX_CACHE_BYTES = 25 * 1024 * 1024; // 25 MB
const THUMB_QUALITY = 0.6;
const THUMB_TIME_MS = 500;
const EVICT_DEBOUNCE_MS = 60_000; // at most one eviction pass per minute

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const limit = createSemaphore(3);
let lastEvictAt = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function thumbDir(): Directory {
  return new Directory(Paths.cache, THUMBS_SUBDIR);
}

function thumbFile(setId: string): File {
  return new File(Paths.cache, `${THUMBS_SUBDIR}/${setId}.jpg`);
}

async function maybeEvict(): Promise<void> {
  const now = Date.now();
  if (now - lastEvictAt < EVICT_DEBOUNCE_MS) return;
  lastEvictAt = now;

  const dir = thumbDir();
  if (!dir.exists) return;

  const entries = dir.list();

  // Build list of {file, size, mtime} sorted oldest-first
  type Entry = { file: File; size: number; mtime: number };
  const items: Entry[] = [];
  let totalBytes = 0;

  for (const f of entries) {
    if (!(f instanceof File)) continue;
    const info = f.info();
    const size = info.size ?? 0;
    const mtime = info.modificationTime ?? 0;
    totalBytes += size;
    items.push({ file: f, size, mtime });
  }

  if (totalBytes <= MAX_CACHE_BYTES) return;

  // Sort oldest first
  items.sort((a, b) => a.mtime - b.mtime);

  for (const item of items) {
    if (totalBytes <= MAX_CACHE_BYTES) break;
    item.file.delete();
    totalBytes -= item.size;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the cached thumbnail URI for `setId`, generating it via
 * `getThumbnailAsync` if not already cached.
 *
 * Throttled to 3 concurrent invocations (inline semaphore).
 */
export async function getOrCreateThumb(
  setId: string,
  relPath: string,
): Promise<string> {
  return limit(async (): Promise<string> => {
    const dest = thumbFile(setId);

    // Cache hit
    if (dest.exists) return dest.uri;

    // Ensure cache dir exists
    const dir = thumbDir();
    if (!dir.exists) dir.create({ intermediates: true });

    // Generate
    const absPath = toAbsPath(relPath);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getThumbnailAsync } = require("expo-video-thumbnails") as typeof import("expo-video-thumbnails");
    const result = await getThumbnailAsync(absPath, {
      time: THUMB_TIME_MS,
      quality: THUMB_QUALITY,
    });

    // Move generated file into cache location
    const tmp = new File(result.uri);
    tmp.move(dest);

    // LRU eviction (debounced)
    await maybeEvict();

    return dest.uri;
  });
}

/**
 * Deletes the cached thumbnail for `setId` if it exists.
 * Call from softDeleteClip and reconcileOrphans.
 */
export async function purgeThumb(setId: string): Promise<void> {
  const f = thumbFile(setId);
  if (f.exists) f.delete();
}
