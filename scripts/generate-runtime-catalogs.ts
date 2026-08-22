#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { readCatalog } from "./i18n/catalog-io";
import { renderRuntimeCatalogs, RUNTIME_LOCALES } from "./i18n/runtime-catalogs";

const root = process.cwd();
const output = path.join(root, "lib/i18n/runtime-catalogs.generated.ts");
const catalogs = Object.fromEntries(RUNTIME_LOCALES.map(locale => [locale, readCatalog(locale, root)]));
const generated = renderRuntimeCatalogs(catalogs);

if (process.argv.includes("--check")) {
  const committed = fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "";
  if (committed !== generated) {
    console.error("I18N_RUNTIME_CATALOG_STALE: run npm run i18n:runtime:gen");
    process.exit(1);
  }
} else {
  fs.writeFileSync(output, generated, "utf8");
}
