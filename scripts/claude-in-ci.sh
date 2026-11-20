#!/usr/bin/env bash
# Runs `claude -p` in a GitHub Actions job (launch-hour.yml,
# health-responder.yml, tally-ready.yml, items-watch.yml) on the Claude API,
# paid from the owner's Console organization, its monthly API credit first.
# It signs in by workload identity federation: GitHub gives the job a
# short-lived identity token, the CLI trades it for a short-lived Claude
# token, and no API key is stored anywhere.
#
# Why not Claude's own GitHub Action: its runs count as Claude Code usage,
# which the monthly API credit doesn't pay for, while `claude -p` run with the
# organization's own access is billed as Agent SDK usage, which it does
# (support.claude.com, "Monthly API credits for Max, Ultra and Team plans").
# The federation setup below mirrors that action's (base-action's
# workload-identity.ts).
#
# Needs the job's `permissions: id-token: write`, the CLI installed, and
# ANTHROPIC_FEDERATION_RULE_ID and ANTHROPIC_ORGANIZATION_ID in the
# environment (ANTHROPIC_SERVICE_ACCOUNT_ID and ANTHROPIC_WORKSPACE_ID too
# when the rule names them).
# With GH_APP_ID and GH_APP_KEY set (a GitHub app's ID and private key), it
# also keeps gh and git signed in as that app for the whole run, renewing the
# app's hour-long token as it goes: what Claude pushes and opens then starts
# the repository's checks, which the workflow's own token never does.
#
# Usage: scripts/claude-in-ci.sh <prompt file> <answer file> [claude flags...]
# Claude's final message goes to the answer file. Nothing else of its run
# reaches the log, which a public repository shows to everyone.

set -euo pipefail

prompt_file=$1
answer_file=$2
shift 2

: "${ANTHROPIC_FEDERATION_RULE_ID:?Set the repository secret ANTHROPIC_FEDERATION_RULE_ID}"
: "${ANTHROPIC_ORGANIZATION_ID:?Set the repository secret ANTHROPIC_ORGANIZATION_ID}"
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?The job needs permissions: id-token: write}"
[ -n "${ANTHROPIC_SERVICE_ACCOUNT_ID:-}" ] || unset ANTHROPIC_SERVICE_ACCOUNT_ID
[ -n "${ANTHROPIC_WORKSPACE_ID:-}" ] || unset ANTHROPIC_WORKSPACE_ID
# Either would win over federation and bill something else.
unset ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN

dir="${RUNNER_TEMP:-/tmp}/claude-in-ci"
rm -rf "$dir"
mkdir -p -m 700 "$dir/configs" "$dir/gh"
# A profile, so the CLI keeps the Claude token it traded for on disk.
printf '{"version":"1.0","authentication":{"type":"oidc_federation"}}\n' > "$dir/configs/default.json"
identity_file="$dir/identity-token"

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
# Each request gets a few tries, none longer than 30 seconds: one that hung
# would stop the renewer below for the rest of the run.
request() { curl -sSf --retry 3 --max-time 30 "$@"; }

# GitHub's identity tokens live minutes; the CLI rereads the file each time
# it renews its Claude token, so a fresh one is always there.
fetch_identity() {
  local jwt
  jwt=$(request -H "Authorization: Bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
    "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=https://api.anthropic.com" | jq -r .value)
  [ -n "$jwt" ] && [ "$jwt" != null ] || return 1
  echo "::add-mask::$jwt"
  (umask 077 && printf '%s' "$jwt" > "$identity_file.new") && mv "$identity_file.new" "$identity_file"
}

# The app's installation token for this repository, written where gh reads
# it on every call (git asks gh, through `gh auth setup-git`).
app_jwt() {
  local now head body sig
  now=$(date +%s)
  head=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
  body=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' $((now - 60)) $((now + 540)) "$GH_APP_ID" | b64url)
  sig=$(printf '%s.%s' "$head" "$body" | openssl dgst -sha256 -sign <(printf '%s\n' "$GH_APP_KEY") | b64url)
  printf '%s.%s.%s' "$head" "$body" "$sig"
}

fetch_app_token() {
  local jwt install token
  jwt=$(app_jwt)
  install=$(request -H "Authorization: Bearer $jwt" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$GITHUB_REPOSITORY/installation" | jq -r .id)
  token=$(request -X POST -H "Authorization: Bearer $jwt" -H "Accept: application/vnd.github+json" \
    -d "{\"repositories\":[\"${GITHUB_REPOSITORY#*/}\"]}" \
    "https://api.github.com/app/installations/$install/access_tokens" | jq -r .token)
  [ -n "$token" ] && [ "$token" != null ] || return 1
  echo "::add-mask::$token"
  (umask 077 && printf 'github.com:\n    oauth_token: %s\n    git_protocol: https\n' "$token" > "$dir/gh/hosts.yml.new") \
    && mv "$dir/gh/hosts.yml.new" "$dir/gh/hosts.yml"
}

fetch_identity
with_app=false
if [ -n "${GH_APP_ID:-}" ] && [ -n "${GH_APP_KEY:-}" ]; then
  with_app=true
  fetch_app_token
  env -u GH_TOKEN -u GITHUB_TOKEN GH_CONFIG_DIR="$dir/gh" gh auth setup-git
  # Commits are the app's own, and Claude learns its login (BOT_LOGIN, and
  # BOT_AUTHOR as gh's --author takes it) to tell its own pull requests and
  # issues from strangers'.
  slug=$(request -H "Authorization: Bearer $(app_jwt)" -H "Accept: application/vnd.github+json" \
    https://api.github.com/app | jq -r .slug)
  export BOT_LOGIN="$slug[bot]" BOT_AUTHOR="app/$slug"
  bot_id=$(env -u GH_TOKEN -u GITHUB_TOKEN GH_CONFIG_DIR="$dir/gh" gh api "users/$BOT_LOGIN" --jq .id)
  git config --global user.name "$BOT_LOGIN"
  git config --global user.email "$bot_id+$BOT_LOGIN@users.noreply.github.com"
fi

(
  n=0
  renewed=0
  while sleep 240; do
    fetch_identity || echo "::warning::Couldn't renew the GitHub identity token for Claude"
    n=$((n + 1))
    # The app's token lives an hour: a new one every 40 minutes, and after a
    # failed try, again 4 minutes later.
    if $with_app && [ $((n - renewed)) -ge 10 ]; then
      fetch_app_token && renewed=$n || echo "::warning::Couldn't renew the GitHub app's token"
    fi
  done
) &
renewer=$!
# Its sleep too, or the step waits for it.
trap 'pkill -P "$renewer" 2>/dev/null; kill "$renewer" 2>/dev/null; rm -rf "$dir"' EXIT

# Claude's environment gets neither the job's way of asking GitHub for
# identity tokens nor the app's key, only the short-lived tokens those make.
# (Not a wall: the renewer above holds them, as the same user.)
env -u ACTIONS_ID_TOKEN_REQUEST_TOKEN -u ACTIONS_ID_TOKEN_REQUEST_URL \
  -u GH_APP_KEY -u GH_APP_ID -u GH_TOKEN -u GITHUB_TOKEN \
  ANTHROPIC_IDENTITY_TOKEN_FILE="$identity_file" \
  ANTHROPIC_CONFIG_DIR="$dir" \
  ANTHROPIC_PROFILE=default \
  GH_CONFIG_DIR="$dir/gh" \
  claude -p "$@" < "$prompt_file" > "$answer_file" || {
    status=$?
    # A run that fails before Claude starts (sign-in, billing, a flag) says
    # why on stdout, which is the answer file: put it on the run's page.
    echo "::error::claude -p failed ($status): $(head -c 500 "$answer_file" | tr -c '[:print:]' ' ')"
    exit "$status"
  }
