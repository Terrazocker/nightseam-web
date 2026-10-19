#!/bin/bash
# Prepare a Claude Code cloud session so the checks in AGENTS.md run as they
# do on CI: version tags for the release and changelog checks, the pinned test
# tooling, web/version.json, and the container's preinstalled Chromium for the
# browser gate. Runs only in cloud sessions; safe to run again.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# check_release, build_changelog --check and the version display read
# `git describe`; a fresh clone may come without tags.
if [ -z "$(git tag --list 'v*' | head -n 1)" ]; then
  git fetch --quiet --tags origin \
    || echo "session-start: could not fetch version tags; release checks will fail" >&2
fi

python -m pip install --quiet --disable-pip-version-check --root-user-action=ignore -r requirements-dev.txt

# Generated and gitignored; check_release reads it.
python web/build_web.py version >/dev/null

# The container ships Chromium for Playwright; never download one. The gate
# reads NIGHTSEAM_BROWSER_EXECUTABLE as its --executable default.
if [ -x /opt/pw-browsers/chromium ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export NIGHTSEAM_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi
