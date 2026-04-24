// BLD-569 AC4: short-copy lint for toast titles.
// Any literal-string title passed to `toast.success/error/warning/info(...)`
// or `toast(...)` must be <= 60 chars (word-budget proxy ~10 words). The goal
// is to preserve at-a-glance legibility during a workout — see
// .learnings/patterns/react-native.md "Toast copy discipline".
//
// Dynamic titles (template literals with ${...} or variable references) are
// out of scope — this lint only catches static string literals.
import fs from 'fs';
import path from 'path';

const MAX_TITLE_LENGTH = 60;
const ROOTS = ['hooks', 'app', 'components'];
const EXT_RE = /\.(ts|tsx)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fp, out);
    else if (entry.isFile() && EXT_RE.test(entry.name)) out.push(fp);
  }
  return out;
}

type Match = { file: string; line: number; length: number; title: string };

function matchesTitles(
  src: string,
  regex: RegExp,
  captureIdx: number,
  isPrefixed: boolean,
): Array<{ title: string; index: number }> {
  const out: Array<{ title: string; index: number }> = [];
  for (const m of src.matchAll(regex)) {
    const idx = m.index ?? 0;
    // Plain `toast(` regexes also match `toast.variant(` — de-dup by the char
    // immediately after `toast`.
    if (isPrefixed && src[idx + 'toast'.length] === '.') continue;
    out.push({ title: m[captureIdx], index: idx });
  }
  return out;
}

function collectToastTitles(repoRoot: string): Match[] {
  // Match forms of `toast.variant("literal")`, `toast("literal")`,
  // `toast.variant('literal')`, and plain backtick template literals without
  // substitutions. Template literals that contain `${}` are skipped because
  // the final length is dynamic.
  const singleDoubleMethod = /\btoast\.(?:success|error|warning|info)\s*\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  const singleDoublePlain = /\btoast\s*\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  const templMethod = /\btoast\.(?:success|error|warning|info)\s*\(\s*`([^`$]*)`/g;
  const templPlain = /\btoast\s*\(\s*`([^`$]*)`/g;

  const offenders: Match[] = [];
  for (const root of ROOTS) {
    const absRoot = path.join(repoRoot, root);
    if (!fs.existsSync(absRoot)) continue;
    for (const file of walk(absRoot)) {
      const src = fs.readFileSync(file, 'utf8');
      const relPath = path.relative(repoRoot, file);
      const hits = [
        ...matchesTitles(src, singleDoubleMethod, 2, false),
        ...matchesTitles(src, singleDoublePlain, 2, true),
        ...matchesTitles(src, templMethod, 1, false),
        ...matchesTitles(src, templPlain, 1, true),
      ];
      for (const { title, index } of hits) {
        if (title.length > MAX_TITLE_LENGTH) {
          const line = src.slice(0, index).split('\n').length;
          offenders.push({ file: relPath, line, length: title.length, title });
        }
      }
    }
  }
  return offenders;
}

describe('toast copy discipline (BLD-569 AC4)', () => {
  it('no toast title literal exceeds 60 characters', () => {
    const repoRoot = path.resolve(__dirname, '../..');
    const offenders = collectToastTitles(repoRoot);
    if (offenders.length > 0) {
      const msg = offenders
        .map((o) => `  ${o.file}:${o.line} (${o.length} chars) "${o.title}"`)
        .join('\n');
      throw new Error(
        `Found ${offenders.length} toast title(s) exceeding ${MAX_TITLE_LENGTH} chars.\n` +
          `Keep titles at-a-glance readable (~10 words) during a workout.\n` +
          `Move detail into the description arg or the options object.\n\n` +
          msg,
      );
    }
    expect(offenders).toEqual([]);
  });
});
