#!/usr/bin/env tsx

import { stripHtmlComments } from "../lib/release-notes-markdown";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  input += chunk;
});
process.stdin.on("end", () => {
  process.stdout.write(stripHtmlComments(input));
});
