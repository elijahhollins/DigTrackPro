#!/bin/bash
# Installs dependencies so `npm run lint` (tsc --noEmit) and the verify-harness
# work in Claude Code on the web. Without this, a fresh remote container has no
# node_modules and tsc reports hundreds of phantom errors ("Cannot find module
# 'react'", implicit-any on every untyped import).
set -euo pipefail

# Local machines manage their own node_modules; only fix up remote containers.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# `npm install`, not `npm ci`: package-lock.json is gitignored in this repo.
# Skip the install when node_modules is already populated and no manifest has
# changed since it was written, so resume/clear firings are near-instant.
if [ -d node_modules ] && [ node_modules -nt package.json ]; then
  echo "node_modules is up to date with package.json; skipping npm install."
else
  npm install --no-audit --no-fund
  touch node_modules
fi

# Best-effort fixture for the PdfMarkupEditor verify harness (gitignored, cheap
# to regenerate). A failure here must not block the session.
if [ ! -f verify-harness/test.pdf ] && [ -f verify-harness/makePdf.mjs ]; then
  node verify-harness/makePdf.mjs || echo "warning: could not generate verify-harness/test.pdf"
fi
