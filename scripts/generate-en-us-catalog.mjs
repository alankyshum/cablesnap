import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const lines = readFileSync("locales/en-US.po", "utf8").split("\n");
const entries = {};
const existing = JSON.parse(readFileSync("locales/en-US.json", "utf8"));
let field = null;
let id = null;
let message = null;

function value(line) {
  return JSON.parse(line.slice(line.indexOf("\"") ));
}

function flush() {
  if (id && message !== null) {
    if (existing[id]?.origin === "human" && existing[id]?.message) message = existing[id].message;
    const srcHash = createHash("sha256").update(`${id}\0${message}`).digest("hex").slice(0, 12);
    entries[id] = { message, srcHash, origin: "human" };
  }
  id = null;
  message = null;
  field = null;
}

for (const line of lines) {
  if (line.startsWith("msgid ")) {
    flush();
    id = value(line);
    field = "id";
  } else if (line.startsWith("msgstr ")) {
    message = value(line);
    field = "message";
  } else if (line.startsWith('"') && field === "id") {
    id += value(line);
  } else if (line.startsWith('"') && field === "message") {
    message += value(line);
  }
}
flush();
for (const [key, entry] of Object.entries(existing)) {
  if (!(key in entries) && entry && typeof entry === "object" && typeof entry.message === "string") {
    entries[key] = entry;
  }
}
writeFileSync("locales/en-US.json", `${JSON.stringify(entries, null, 2)}\n`);
