#!/bin/bash
set -euo pipefail

echo "========================================="
echo " SidPrep 2.0 Admin Password Dispatcher"
echo "========================================="

# Determine project directory
if [ -d "/opt/sidprep" ]; then
  PROJECT_DIR="/opt/sidprep"
elif [ -d "$HOME/SidPrep" ]; then
  PROJECT_DIR="$HOME/SidPrep"
else
  PROJECT_DIR="$(pwd)"
fi

cd "$PROJECT_DIR"

echo "Generating and dispatching new secure admin password..."
if docker compose ps | grep -q "sidprep_api.*running"; then
  echo "Executing inside running sidprep_api container..."
  docker compose exec -T api node dist/scripts/dispatch-admin-pass.js
else
  echo "Executing with local node environment..."
  node apps/api/dist/scripts/dispatch-admin-pass.js || npx tsx apps/api/src/scripts/dispatch-admin-pass.ts
fi

echo ""
echo "========================================="
echo " Dispatch Complete!"
echo " Check your email: sksakirhossain8@gmail.com"
echo " (Sensitive credentials are saved only on this server in admin_credentials.json)"
echo "========================================="
