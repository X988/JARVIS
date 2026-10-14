#!/bin/sh
set -eu
# Work from the checkout so this also starts correctly on a local Linux server.
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
node scripts/preview.mjs stop || true
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev >>/tmp/app-startup.log 2>&1 &
