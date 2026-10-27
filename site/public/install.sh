#!/bin/sh
# Installs the Squiggle command line (squigglelang) with npm.
#   curl -fsSL https://squiggle.oiaj2341.workers.dev/install.sh | sh
# It only runs `npm install -g squigglelang`; read it first if you like.
set -e

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Squiggle needs Node.js 18 or newer (it comes with npm)."
  echo "Get it from https://nodejs.org, then run this again."
  exit 1
fi

major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 18 ]; then
  echo "Squiggle needs Node.js 18 or newer; this machine has $(node -v)."
  exit 1
fi

echo "Installing squigglelang with npm…"
npm install -g squigglelang

echo
echo "Done. Try:"
echo "  squiggle render tide --out tide.png"
echo "  squiggle shell"
