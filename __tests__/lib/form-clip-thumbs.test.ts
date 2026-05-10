/**
 * __tests__/lib/form-clip-thumbs.test.ts
 *
 * BLD-1151 AC13: form-clip-thumbs LRU cache unit tests.
 * Uses the new expo-file-system File/Directory/Paths API.
 */

// -- Mocks (must come before imports) --

const mockGetThumbnailAsync = jest.fn();

interface FakeEntry { exists: boolean; size?: number; modificationTime?: number; }
// mockFakeFS prefix allows factory closure to reference it
const mockFakeFS = new Map<string, FakeEntry>();

jest.mock("expo-video-thumbnails", () => ({
  getThumbnailAsync: (...a: unknown[]) => mockGetThumbnailAsync(...a),
}));

jest.mock("expo-file-system", () => {
  const CACHE_URI = "file:///cache/";
  const DOCS_URI = "file:///docs/";

  class FakeFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      const segs = parts.map((p: string | { uri: string }) =>
        typeof p === "string" ? p : p.uri,
      );
      // Join segments like path.join: each seg's leading slashes stripped, separator added
      let u = segs[0];
      for (let i = 1; i < segs.length; i++) {
        const seg = segs[i].replace(/^\/+/, "");
        if (!u.endsWith("/")) u += "/";
        u += seg;
      }
      this.uri = u;
    }
    get exists(): boolean { return mockFakeFS.get(this.uri)?.exists ?? false; }
    info(): FakeEntry { return mockFakeFS.get(this.uri) ?? { exists: false, size: 0, modificationTime: 0 }; }
    delete(): void { mockFakeFS.delete(this.uri); }
    move(dest: FakeFile): void {
      const s = mockFakeFS.get(this.uri) ?? { exists: true };
      mockFakeFS.set(dest.uri, s);
      mockFakeFS.delete(this.uri);
    }
  }

  class FakeDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      const segs = parts.map((p: string | { uri: string }) =>
        typeof p === "string" ? p : p.uri,
      );
      let u = segs[0];
      for (let i = 1; i < segs.length; i++) {
        const seg = segs[i].replace(/^\/+/, "");
        if (!u.endsWith("/")) u += "/";
        u += seg;
      }
      if (!u.endsWith("/")) u += "/";
      this.uri = u;
    }
    get exists(): boolean { return true; }
    create(_opts?: unknown): void { /* noop */ }
    list(): FakeFile[] {
      return Array.from(mockFakeFS.entries())
        .filter(([k, v]) =>
          k.startsWith(this.uri) &&
          k !== this.uri &&
          v.exists &&
          !k.slice(this.uri.length).includes("/"),
        )
        .map(([k]) => new FakeFile(k));
    }
  }

  const cacheDir = new FakeDirectory(CACHE_URI);
  const docsDir = new FakeDirectory(DOCS_URI);

  return {
    File: FakeFile,
    Directory: FakeDirectory,
    Paths: { cache: cacheDir, document: docsDir },
  };
});

// -- Static imports (after mocks) --

import { getOrCreateThumb, purgeThumb } from "../../lib/media/form-clip-thumbs";

// -- Constants --

const MB = 1024 * 1024;
const CACHE_DIR = "file:///cache/form-clip-thumbs/";
const thumbUri = (id: string) => `${CACHE_DIR}${id}.jpg`;

beforeEach(() => {
  jest.clearAllMocks();
  mockFakeFS.clear();
  mockGetThumbnailAsync.mockResolvedValue({ uri: "file:///tmp/gen.jpg" });
  // Seed the generated tmp file
  mockFakeFS.set("file:///tmp/gen.jpg", { exists: true, size: 5000 });
});

// -- Tests --

describe("getOrCreateThumb (AC13)", () => {
  it("generates thumbnail and calls getThumbnailAsync with correct params", async () => {
    await getOrCreateThumb("set-001", "form-clips/ex-1/clip-001.mp4");
    expect(mockGetThumbnailAsync).toHaveBeenCalledTimes(1);
    expect(mockGetThumbnailAsync).toHaveBeenCalledWith(
      expect.stringContaining("form-clips/ex-1/clip-001.mp4"),
      expect.objectContaining({ time: 500, quality: 0.6 }),
    );
  });

  it("returns cached thumbnail without calling getThumbnailAsync again", async () => {
    mockFakeFS.set(thumbUri("set-cached"), { exists: true, size: 5000 });
    const result = await getOrCreateThumb("set-cached", "form-clips/ex-1/clip.mp4");
    expect(mockGetThumbnailAsync).not.toHaveBeenCalled();
    expect(result).toContain("set-cached.jpg");
  });
});

describe("purgeThumb (AC13)", () => {
  it("deletes cached file when it exists", async () => {
    mockFakeFS.set(thumbUri("set-purge"), { exists: true, size: 5000 });
    await purgeThumb("set-purge");
    expect(mockFakeFS.get(thumbUri("set-purge"))?.exists ?? false).toBe(false);
  });

  it("does not throw when file is absent", async () => {
    await expect(purgeThumb("set-none")).resolves.not.toThrow();
  });
});

describe("LRU eviction — 25 MB cap (AC13)", () => {
  it("evicts oldest entries when cache exceeds 25 MB", async () => {
    // Advance Date.now past the 60s eviction debounce so this test isn't
    // suppressed by a lastEvictAt set in a previous test.
    const futureNow = Date.now() + 120_000;
    const dateSpy = jest.spyOn(Date, "now").mockReturnValue(futureNow);

    // Seed 30 x 1 MB thumbs; oldest = smallest mtime.
    for (let i = 0; i < 30; i++) {
      mockFakeFS.set(thumbUri(`set-lru-${String(i).padStart(3, "0")}`), {
        exists: true,
        size: MB,
        modificationTime: futureNow - (30 - i) * 1000,
      });
    }
    // Make a new thumb
    const newUri = "file:///tmp/lru-gen.jpg";
    mockFakeFS.set(newUri, { exists: true, size: 5000 });
    mockGetThumbnailAsync.mockResolvedValueOnce({ uri: newUri });

    await getOrCreateThumb("set-lru-new", "form-clips/ex-1/clip-new.mp4");

    dateSpy.mockRestore();

    let remaining = 0;
    for (const [k, v] of mockFakeFS) {
      if (k.startsWith(CACHE_DIR) && (v.exists ?? false)) remaining += v.size ?? 0;
    }
    expect(remaining).toBeLessThanOrEqual(25 * MB);
  });
});

describe("Concurrency cap = 3 (AC13)", () => {
  it("never exceeds 3 simultaneous getThumbnailAsync calls", async () => {
    let active = 0;
    let max = 0;
    mockGetThumbnailAsync.mockImplementation(() => {
      active++;
      if (active > max) max = active;
      const uri = `file:///tmp/conc-${Math.random()}.jpg`;
      mockFakeFS.set(uri, { exists: true, size: 100 });
      return new Promise<{ uri: string }>((res) =>
        setTimeout(() => {
          active--;
          res({ uri });
        }, 10),
      );
    });
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        getOrCreateThumb(`set-conc-${i}`, `form-clips/ex-1/c${i}.mp4`),
      ),
    );
    expect(max).toBeLessThanOrEqual(3);
  });
});
