#!/bin/sh
# Truth pin: fail the build if product copy drifts from Live Tennis API ground
# truth (quota grid of 2026-08-06, canonical URLs). POSIX sh, no dependencies.
#
# CHANGELOG.md is exempt from the FORBID pass: its history entries legitimately
# describe copy that used to be wrong.
set -u

cd "$(dirname "$0")/.."

# Tracked text files, minus the changelog, the lockfile, and this script (its
# own forbid patterns would match themselves).
files=$(git ls-files '*.md' '*.ts' '*.mjs' '*.json' '*.yml' '*.sh' |
  grep -v -e '^CHANGELOG\.md$' -e '^package-lock\.json$' -e '^scripts/truthcheck\.sh$')

status=0

forbid() {
  pattern="$1"
  reason="$2"
  # shellcheck disable=SC2086
  hits=$(printf '%s\n' "$files" | xargs grep -inE "$pattern" 2>/dev/null)
  if [ -n "$hits" ]; then
    echo "TRUTHCHECK FAIL — $reason:"
    echo "$hits"
    status=1
  fi
}

# Stale quota figures near day-quota context.
forbid '(100[,.]?000|100k).{0,40}(/ ?day|per ?day|daily|requests a day)' 'stale 100k/day quota figure'
forbid '[Ff]ree.{0,60}(1[,.]?000|1k) ?(requests?)? ?(/ ?day|per ?day|a day)' 'free tier paired with 1,000/day (that is BASIC)'
# Wrong canonical URLs and identities.
forbid 'livetennisapi\.com/docs' 'docs live at docs.livetennisapi.com, never livetennisapi.com/docs'
forbid 'bensynapse' 'personal handle in repo metadata'
forbid 'midnight UTC' 'daily reset is not midnight UTC (resets_at carries the instant)'

# If the repo states quotas at all, the current FREE figure and the docs domain
# must both be present somewhere.
# shellcheck disable=SC2086
if printf '%s\n' "$files" | xargs grep -qiE 'requests? ?(/ ?|per ?)day' 2>/dev/null; then
  # shellcheck disable=SC2086
  if ! printf '%s\n' "$files" | xargs grep -qE '100/day|100 requests/day|100 requests per day' 2>/dev/null; then
    echo 'TRUTHCHECK FAIL — repo states day quotas but never the FREE figure (100/day)'
    status=1
  fi
  # shellcheck disable=SC2086
  if ! printf '%s\n' "$files" | xargs grep -q 'docs\.livetennisapi\.com' 2>/dev/null; then
    echo 'TRUTHCHECK FAIL — repo states quotas but never links docs.livetennisapi.com'
    status=1
  fi
fi

if [ "$status" -eq 0 ]; then
  echo 'truthcheck: OK'
fi
exit "$status"
