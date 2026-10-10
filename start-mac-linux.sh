#!/bin/sh
# Starts the Learning Ledger on http://localhost:8765 and opens it in your browser.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install it from https://nodejs.org, or open index.html directly."
  exit 1
fi
( sleep 1; (open "http://localhost:8765" 2>/dev/null || xdg-open "http://localhost:8765" 2>/dev/null) ) &
node serve.js
