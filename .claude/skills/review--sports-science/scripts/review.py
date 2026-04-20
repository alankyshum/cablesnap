#!/usr/bin/env python3
"""Sports science & nutrition review via Gemini 3.1 Pro Preview.

Takes a feature proposal (text or file path) and returns an evidence-based
review from a sports science / nutrition perspective.

Uses Perplexity Sonar for research, Gemini 3.1 Pro for analysis.
"""

import argparse
import json
import os
import sys

import requests

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
GEMINI_MODEL = "gemini-3.1-pro-preview"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions"
PERPLEXITY_API_KEY = os.environ.get("PERPLEXITY_API_KEY", "")

EXPERT_SYSTEM_PROMPT = """You are a panel of three experts reviewing a fitness app feature proposal:
1. A certified sports scientist (CSCS, NSCA) specializing in resistance training periodization
2. A registered dietitian (RD) specializing in sports nutrition
3. A behavioral psychologist specializing in health app engagement and habit formation

For the given feature proposal and research context, provide:

## Scientific Accuracy
Rate each claim or assumption in the feature as: SUPPORTED / PARTIALLY_SUPPORTED / UNSUPPORTED / NOT_APPLICABLE
For each, cite the relevant research or established guideline.

## Safety Concerns
Flag anything that could lead users to injury, disordered eating, overtraining, or psychological harm.
Rate each: NONE / LOW / MEDIUM / HIGH / CRITICAL

## Evidence-Based Recommendations
Suggest improvements grounded in sports science literature. Be specific — reference rep ranges, volume landmarks, RPE scales, nutrient timing windows, progressive overload principles, etc. where relevant.

## Engagement Psychology Assessment
Evaluate the gamification/motivation elements against Self-Determination Theory (autonomy, competence, relatedness), habit loop design, and known pitfalls of fitness app gamification (e.g., overemphasis on streaks causing guilt, extrinsic motivation crowding out intrinsic).

## Verdict
APPROVE — scientifically sound, proceed as designed
APPROVE_WITH_CHANGES — good concept, needs specific adjustments (list them)
NEEDS_RESEARCH — insufficient evidence to evaluate, suggest what to investigate
REJECT — fundamentally flawed or potentially harmful (explain why)

Keep the review actionable. The audience is a CEO planning the next feature — they need clear go/no-go signals with specific changes, not academic hedging."""


def search_research(proposal: str) -> str:
    """Use Perplexity to gather relevant sports science research."""
    query = (
        f"Sports science and exercise physiology research relevant to this fitness app feature: "
        f"{proposal[:500]}. "
        f"Find peer-reviewed evidence, ACSM/NSCA guidelines, and established best practices. "
        f"Include specific studies, meta-analyses, or position stands where available."
    )
    headers = {
        "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "sonar",
        "messages": [{"role": "user", "content": query}],
    }
    try:
        resp = requests.post(PERPLEXITY_API_URL, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        answer = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        citations = data.get("citations", [])
        return f"{answer}\n\nSources:\n" + "\n".join(f"- {c}" for c in citations)
    except Exception as e:
        return f"(Research unavailable: {e})"


def review_with_gemini(proposal: str, research_context: str) -> dict:
    """Send proposal + research to Gemini 3.1 Pro for expert review."""
    if not GOOGLE_API_KEY:
        return {"error": "GOOGLE_API_KEY not set"}

    user_prompt = (
        f"## Feature Proposal\n\n{proposal}\n\n"
        f"## Research Context (from literature search)\n\n{research_context}"
    )

    payload = {
        "contents": [{"parts": [{"text": user_prompt}]}],
        "systemInstruction": {"parts": [{"text": EXPERT_SYSTEM_PROMPT}]},
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 4096,
        },
    }

    try:
        resp = requests.post(
            f"{GEMINI_URL}?key={GOOGLE_API_KEY}",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return {"review": text, "model": GEMINI_MODEL}
    except requests.exceptions.HTTPError as e:
        return {"error": f"HTTP {e.response.status_code}", "detail": e.response.text[:500]}
    except Exception as e:
        return {"error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Sports science review of fitness app features")
    parser.add_argument("proposal", help="Feature proposal text, or path to a file containing it")
    parser.add_argument("--skip-research", action="store_true", help="Skip Perplexity research step")
    parser.add_argument("--json", action="store_true", help="Output raw JSON instead of formatted text")
    args = parser.parse_args()

    # Read proposal from file if it's a path
    proposal = args.proposal
    if os.path.isfile(proposal):
        with open(proposal) as f:
            proposal = f.read()

    # Step 1: Research
    if not args.skip_research:
        sys.stderr.write("Searching sports science literature...\n")
        research = search_research(proposal)
    else:
        research = "(Research skipped)"

    # Step 2: Expert review
    sys.stderr.write("Running expert panel review via Gemini 3.1 Pro...\n")
    result = review_with_gemini(proposal, research)

    if args.json:
        result["research_context"] = research
        print(json.dumps(result, indent=2))
    else:
        if "error" in result:
            print(f"ERROR: {result['error']}")
            if "detail" in result:
                print(result["detail"])
            sys.exit(1)
        print(result["review"])
        print(f"\n---\nModel: {result['model']}")


if __name__ == "__main__":
    main()
