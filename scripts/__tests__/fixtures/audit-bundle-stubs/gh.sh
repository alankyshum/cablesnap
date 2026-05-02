#!/usr/bin/env bash
# State-backed `gh` stub for BLD-950 audit-bundle.sh tests.
# State file: $STUB_GH_STATE  (JSON: {releases:[{tagName,draft,prerelease,immutable,assets,createdAt}]})
# Upload failure mode: $STUB_GH_UPLOAD_FAIL_MODE  (none | immutable-on-clobber | always-fail)
#
# Supports the gh subcommands invoked by scripts/audit-bundle.sh:
#   gh auth status
#   gh release view <tag> [--json url --jq '.url']
#   gh release create <tag> <asset> --draft --prerelease --title T --notes N
#   gh release upload <tag> <asset> --clobber
#   gh release edit <tag> --draft=false --prerelease
#   gh release list --limit 100 --json tagName,createdAt --jq '...'
#   gh release delete <tag> --yes --cleanup-tag

set -u
STATE="${STUB_GH_STATE:?STUB_GH_STATE not set}"
UPLOAD_MODE="${STUB_GH_UPLOAD_FAIL_MODE:-none}"

sub="${1:-}"; shift || true
action="${1:-}"; shift || true

if [[ "$sub" == "auth" && "$action" == "status" ]]; then
  echo "Logged in to github.com (stub)" >&2
  exit 0
fi

if [[ "$sub" != "release" ]]; then
  echo "[gh-stub] unsupported subcommand: $sub" >&2
  exit 1
fi

case "$action" in
  view)
    tag="$1"; shift
    exists=$(jq --arg t "$tag" '.releases | map(select(.tagName==$t)) | length' "$STATE")
    if [[ "$exists" == "0" ]]; then
      echo "release not found: $tag" >&2
      exit 1
    fi
    # Honor --json <fields> [--jq <filter>]
    json_fields=""
    jq_filter=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --json) shift; json_fields="$1" ;;
        --jq)   shift; jq_filter="$1" ;;
      esac
      shift
    done
    if [[ -n "$json_fields" ]]; then
      # Build a filtered object containing only the requested fields. We
      # support the fields the script actually uses today: url, isDraft.
      # The release record in $STATE doesn't carry a `url` field, so we
      # synthesize one. `isDraft` maps to the stored `draft` flag.
      built=$(jq -c --arg t "$tag" '
        .releases[] | select(.tagName==$t) |
        {
          url: ("https://example.test/releases/" + .tagName),
          isDraft: .draft,
          tagName: .tagName,
          isPrerelease: .prerelease,
          createdAt: .createdAt
        }
      ' "$STATE")
      # Project to only the requested fields (comma-separated) so the
      # output shape matches `gh` behavior closely.
      proj_filter=$(echo "$json_fields" | awk -F, '{
        printf "{";
        for (i=1; i<=NF; i++) { if (i>1) printf ","; printf "%s: .%s", $i, $i }
        printf "}";
      }')
      projected=$(echo "$built" | jq -c "$proj_filter")
      if [[ -n "$jq_filter" ]]; then
        echo "$projected" | jq -r "$jq_filter"
      else
        echo "$projected"
      fi
    fi
    exit 0
    ;;
  create)
    tag="$1"; shift
    asset="$1"; shift
    draft=false; prerelease=false
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --draft) draft=true ;;
        --prerelease) prerelease=true ;;
        --title|--notes) shift ;;
      esac
      shift
    done
    asset_base=$(basename "$asset")
    tmp=$(mktemp)
    jq --arg t "$tag" --arg a "$asset_base" --argjson d "$draft" --argjson p "$prerelease" \
      '.releases += [{tagName:$t, draft:$d, prerelease:$p, immutable:false, assets:[$a], createdAt:"2026-05-02T12:00:00Z"}]' \
      "$STATE" > "$tmp" && mv "$tmp" "$STATE"
    echo "https://example.test/releases/$tag"
    exit 0
    ;;
  upload)
    tag="$1"; shift
    asset="$1"; shift
    clobber=false
    while [[ $# -gt 0 ]]; do
      case "$1" in --clobber) clobber=true ;; esac
      shift
    done
    asset_base=$(basename "$asset")
    immut=$(jq -r --arg t "$tag" '.releases[] | select(.tagName==$t) | .immutable' "$STATE")
    if [[ "$immut" == "true" && "$clobber" == "true" ]]; then
      if [[ "$UPLOAD_MODE" == "immutable-on-clobber" || "$UPLOAD_MODE" == "always-fail" ]]; then
        echo "HTTP 422: Cannot delete asset from an immutable release" >&2
        exit 1
      fi
    fi
    if [[ "$UPLOAD_MODE" == "always-fail" ]]; then
      echo "upload failed (always-fail mode)" >&2
      exit 1
    fi
    tmp=$(mktemp)
    jq --arg t "$tag" --arg a "$asset_base" \
      '.releases |= map(if .tagName==$t then .assets = ((.assets + [$a]) | unique) else . end)' \
      "$STATE" > "$tmp" && mv "$tmp" "$STATE"
    exit 0
    ;;
  edit)
    tag="$1"; shift
    new_draft=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --draft=false) new_draft=false ;;
        --draft=true)  new_draft=true ;;
        --draft) new_draft=true ;;
        --prerelease) : ;;
      esac
      shift
    done
    if [[ -n "$new_draft" ]]; then
      tmp=$(mktemp)
      jq --arg t "$tag" --argjson d "$new_draft" \
        '.releases |= map(if .tagName==$t then .draft = $d else . end)' \
        "$STATE" > "$tmp" && mv "$tmp" "$STATE"
    fi
    exit 0
    ;;
  list)
    # The script does:
    #   gh release list --limit 100 --json tagName,createdAt --jq '<filter>'
    # Honor --jq by piping through jq locally.
    jq_filter=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --jq) shift; jq_filter="$1" ;;
      esac
      shift
    done
    if [[ -n "$jq_filter" ]]; then
      jq -r ".releases | map({tagName, createdAt}) | $jq_filter" "$STATE"
    else
      jq -c '[.releases[] | {tagName, createdAt}]' "$STATE"
    fi
    exit 0
    ;;
  delete)
    tag="$1"; shift
    tmp=$(mktemp)
    jq --arg t "$tag" '.releases |= map(select(.tagName != $t))' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
    exit 0
    ;;
  *)
    echo "[gh-stub] unsupported release action: $action" >&2
    exit 1
    ;;
esac
