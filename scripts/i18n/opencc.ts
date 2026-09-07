import OpenCC from "opencc-js";
import type { Catalog } from "./catalog-io";

const convertTwToSp = OpenCC.Converter({ from: "tw", to: "cn" });
const convertSpToTw = OpenCC.Converter({ from: "cn", to: "tw" });

/** Convert Traditional Chinese to Simplified Chinese using OpenCC's tw2sp mapping. */
export function tw2sp(text: string): string {
  return convertTwToSp(text);
}

/** Convert Simplified Chinese to Traditional Chinese using OpenCC's cn2tw mapping. */
export function sp2tw(text: string): string {
  return convertSpToTw(text);
}

export function generateZhCnCatalog(zhTw: Catalog, overrides: Catalog = {}): Catalog {
  const generated: Catalog = {};
  for (const [key, value] of Object.entries(zhTw)) {
    generated[key] = convertCatalogValue(value);
  }
  return { ...generated, ...overrides };
}

function convertCatalogValue(value: Catalog[string]): Catalog[string] {
  if (typeof value === "string") return tw2sp(value);
  return { ...value, message: tw2sp(value.message) };
}
