import { createHash } from "node:crypto";

export type CatalogOrigin = "machine" | "human";

export interface CatalogEntry {
  message: string;
  srcHash: string;
  origin: CatalogOrigin;
}

export function sourceHash(key: string, source: string): string {
  return createHash("sha256").update(`${key}\0${source}`).digest("hex").slice(0, 12);
}

export function shouldSkipEntry(entry: CatalogEntry | undefined, key: string, source: string): boolean {
  return Boolean(entry && (entry.origin === "human" || entry.srcHash === sourceHash(key, source)));
}

export function makeCatalogEntry(key: string, source: string, message: string, origin: CatalogOrigin = "machine"): CatalogEntry {
  return { message, srcHash: sourceHash(key, source), origin };
}
