---
name: review--sports-science
description: "Sports science & nutrition expert review of fitness app feature proposals. Uses Perplexity research + Gemini 3.1 Pro analysis. Use during planning to validate CEO feature ideas."
---

# Sports Science Feature Review

Evidence-based review of CableSnap feature proposals by a simulated expert panel (sports scientist, dietitian, behavioral psychologist). Intended as a planning-stage guardrail — lets the CEO ideate freely while catching scientifically unsound assumptions before implementation.

## Critical Rules

- **MUST** run this review on any feature touching exercise programming, nutrition tracking, recovery, body composition, or gamification of health behaviors
- **MUST** include the Perplexity research step (don't skip unless network is unavailable)
- **NEVER** treat the review as a hard gate — it's advisory input for the CEO's decision
- **MUST** present the verdict clearly: APPROVE / APPROVE_WITH_CHANGES / NEEDS_RESEARCH / REJECT

## Prerequisites

- `GOOGLE_API_KEY` env var (Gemini API)
- `PERPLEXITY_API_KEY` env var (Perplexity Sonar)
- Python 3 with `requests` (uses search--web skill's venv)

## Usage

```bash
VENV="$HOME/.claude/skills/search--web/scripts/.venv/bin/python"
SCRIPT="$HOME/.claude/skills/review--sports-science/scripts/review.py"

# Review a feature proposal (text)
$VENV $SCRIPT "Add user levels based on achievement count: Beginner(0), Regular(3), Committed(6), Athlete(10), Elite(14), Legend(18)"

# Review from a file (plan, ticket description, etc.)
$VENV $SCRIPT path/to/feature-proposal.md

# JSON output for programmatic use
$VENV $SCRIPT "proposal text" --json

# Skip research (offline/fast mode)
$VENV $SCRIPT "proposal text" --skip-research
```

## Workflow: CEO Feature Planning

```
1. CEO proposes feature idea (ticket, chat, or doc)
2. Run this skill on the proposal text
3. Review the expert panel output:
   - APPROVE → proceed to architecture/planning
   - APPROVE_WITH_CHANGES → incorporate changes, then proceed
   - NEEDS_RESEARCH → investigate flagged areas before planning
   - REJECT → discuss concerns with CEO, pivot or abandon
4. Attach review output to the ticket for traceability
```

## What It Reviews

| Dimension | Expert | Focus |
|-----------|--------|-------|
| Scientific accuracy | Sports scientist (CSCS) | Claims, rep ranges, volume, periodization, progressive overload |
| Nutrition validity | Dietitian (RD) | Macro targets, meal timing, supplement claims, disordered eating risk |
| Safety | All three | Injury risk, overtraining, psychological harm |
| Engagement design | Behavioral psychologist | SDT compliance, habit loops, gamification pitfalls |

## Integration with Planning Pipeline

This skill sits between CEO ideation and technical planning:

```
CEO Idea → [review--sports-science] → Architect/Planning → [review--adversarial] → Execution
              ↑ you are here                                    ↑ technical feasibility
              (domain validity)
```

The existing guardrails (tests, type safety, DB review, adversarial review) handle execution quality. This skill handles **domain correctness** — ensuring features are grounded in exercise science before any code is written.
