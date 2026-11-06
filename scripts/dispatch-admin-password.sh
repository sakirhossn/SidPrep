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

echo "Executing password generator inside Docker API environment..."

if docker compose exec -T api node apps/api/dist/scripts/dispatch-admin-pass.js 2>/dev/null; then
  echo "Dispatched via docker compose api."
elif docker compose exec -T api node dist/scripts/dispatch-admin-pass.js 2>/dev/null; then
  echo "Dispatched via docker compose api."
elif docker exec -i sidprep_api node apps/api/dist/scripts/dispatch-admin-pass.js 2>/dev/null; then
  echo "Dispatched via container sidprep_api."
else
  echo "Container not running. Executing with Docker Compose run..."
  docker compose run --rm api node dist/scripts/dispatch-admin-pass.js
fi

echo ""
echo "========================================="
echo " Dispatch Complete!"
echo " Check your email: sksakirhossain8@gmail.com"
echo " (From: SidPrep <no-reply@sidprep.in>)"
echo " Sensitive credentials saved on server: /opt/sidprep/admin_credentials.json"
echo "========================================="
