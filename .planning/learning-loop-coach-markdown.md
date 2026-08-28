# Learning loop — Coach full Markdown

## Learnings

1. **Staged-lint gate is stricter than the repo lint script.** The pre-commit hook runs ESLint over staged
   TypeScript with `--max-warnings=0`, while `npm run lint` allows a warning budget. Expect a commit to fail on
   warnings that the repo-wide gate accepts, and resolve or scope-disable them in the touched file.
   `Memory only`

2. **Prefer a zero-dependency lexer plus an in-repo renderer when adding Markdown to React Native.** It keeps
   custom table, gesture, and theming behavior, and adds far fewer bytes than a full React Native Markdown
   renderer stack. Verify the chosen parser publishes a CommonJS entry, because ESM-only builds break Jest's
   `require`. `Memory only`

3. **Keep the detection helper and the renderer on the same parser tree.** A separate line-scanning heuristic for
   "does this message contain a table" drifts from what actually renders and silently breaks gesture handling.
   `Memory only`

## Skill updates

None. The findings are repo-local execution details plus practice already encoded in the committed code and its
regression tests.

## Applied log

```
<iso-timestamp>	memory	coach markdown: staged-lint zero-warning gate, lexer-plus-custom-renderer strategy, shared table detection tree
```
