---
name: roadmap--feature-gate
description: Enforce roadmap checks against explicitly unimplemented roadmap items; use when a user asks to build, add, create, or implement a new feature.
---

# Goal

Keep unimplemented roadmap items visible before new feature work begins.

# Operations

When a user first asks to build, add, create, or implement a new feature:

1. Scan `roadmap/**/*.md`.
2. Identify files explicitly marked `status: unimplemented` in frontmatter or equivalent explicit status metadata/content.
3. Halt before planning, research, or editing. Respond with only the matching file paths, one per line. Do not add a heading, description, recommendation, or implementation.
4. If no matching files exist, say so concisely.

After showing the list, treat “continue,” “build it anyway,” “proceed,” “insist,” or another clear override as approval and allow normal feature development.

Do not gate bug fixes, maintenance, tests, refactors, or work already explicitly approved or underway. Do not use a fixed file list; rescan the roadmap each time a new-feature request is first evaluated.
