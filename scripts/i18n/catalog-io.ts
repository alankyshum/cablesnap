import fs from "node:fs";
import path from "node:path";
import type { CatalogEntry } from "./catalog-entry";

export type Catalog = Record<string, CatalogEntry | string>;

export function catalogPath(locale: string, root = process.cwd()): string {
  return path.join(root, "locales", `${locale}.json`);
}

export function readCatalog(locale: string, root = process.cwd()): Catalog {
  const file = catalogPath(locale, root);
  if (!fs.existsSync(file)) return {};
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Catalog must be a JSON object: ${file}`);
  }
  return parsed as Catalog;
}

export function writeCatalog(locale: string, catalog: Catalog, root = process.cwd()): void {
  const file = catalogPath(locale, root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}
