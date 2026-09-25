#!/usr/bin/env bash
# Secure fallback for Paperclip runs whose managed GitHub App installation
# does not include the target repository. The token is injected as an encrypted
# Paperclip secret binding and is never accepted as a command-line argument.
set -euo pipefail

if [[ -z "${PAPERCLIP_GITHUB_PAT:-}" ]]; then
  printf '%s\n' 'PAPERCLIP_GITHUB_PAT is not available in this run.' >&2
  exit 78
fi

remote="${1:-origin}"
branch="${2:-}"
shift $(( $# >= 2 ? 2 : $# ))

if [[ -z "$branch" ]]; then
  branch="$(git symbolic-ref --quiet --short HEAD || true)"
fi
if [[ -z "$branch" ]]; then
  printf '%s\n' 'Cannot push a detached HEAD without an explicit branch.' >&2
  exit 2
fi

# Keep the real Git binary out of Paperclip's launcher. The launcher is useful
# for the normal managed path, but this fallback deliberately uses the bound
# company credential when the installation is missing the repository.
git_bin="${GIT_BIN:-/usr/bin/git}"
if [[ ! -x "$git_bin" ]]; then
  git_bin="$(type -P git || true)"
fi
if [[ -z "$git_bin" || ! -x "$git_bin" ]]; then
  printf '%s\n' 'Git executable not found.' >&2
  exit 127
fi

credential_helper='!f() { if [ "$1" = get ]; then printf "username=x-access-token\\npassword=%s\\n" "$PAPERCLIP_GITHUB_PAT"; fi; }; f'

# Do not use --force. The command-scope helper overrides host/global helpers
# without putting the token in argv, logs, or the repository configuration.
GIT_CONFIG_NOSYSTEM=1 \
GIT_CONFIG_GLOBAL=/dev/null \
GIT_TERMINAL_PROMPT=0 \
GIT_ASKPASS='' \
GIT_CONFIG_COUNT=2 \
GIT_CONFIG_KEY_0=credential.helper \
GIT_CONFIG_VALUE_0='' \
GIT_CONFIG_KEY_1=credential.helper \
GIT_CONFIG_VALUE_1="$credential_helper" \
  "$git_bin" push "$remote" "HEAD:refs/heads/$branch" "$@"

local_sha="$($git_bin rev-parse HEAD)"
remote_sha="$(GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0 GIT_ASKPASS='' \
  GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=credential.helper GIT_CONFIG_VALUE_0='' \
  GIT_CONFIG_KEY_1=credential.helper GIT_CONFIG_VALUE_1="$credential_helper" \
  "$git_bin" ls-remote "$remote" "refs/heads/$branch" | awk 'NR == 1 { print $1 }')"

if [[ "$remote_sha" != "$local_sha" ]]; then
  printf 'Push verification failed for %s/%s (remote did not match HEAD).\n' "$remote" "$branch" >&2
  exit 1
fi

printf 'Published %s to %s/%s\n' "$local_sha" "$remote" "$branch"
