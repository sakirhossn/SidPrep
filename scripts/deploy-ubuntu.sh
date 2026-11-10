#!/bin/bash
set -euo pipefail

echo "========================================="
echo " SidPrep 2.0 Production Deployment"
echo "========================================="

# Determine project directory
if [ -d "/opt/sidprep" ]; then
  PROJECT_DIR="/opt/sidprep"
elif [ -d "$HOME/SidPrep" ]; then
  PROJECT_DIR="$HOME/SidPrep"
else
  PROJECT_DIR="$(pwd)"
fi

echo "Working directory: $PROJECT_DIR"
cd "$PROJECT_DIR"

# 1. Pull latest changes from GitHub
echo "[1/4] Pulling latest code from origin/main..."
git fetch origin main
git pull origin main
chmod +x scripts/*.sh 2>/dev/null || true

# 2. Setup/verify .env file with production credentials
if [ ! -f .env ]; then
  echo "[2/4] .env not found. Copying defaults from .env.example..."
  cp .env.example .env
fi

# Ensure Brevo sender is verified SidPrep <no-reply@sidprep.in>
if [ -f .env ]; then
  if grep -q "BREVO_SENDER_NAME=SidPrep Notifications" .env; then
    sed -i 's/BREVO_SENDER_NAME=.*/BREVO_SENDER_NAME=SidPrep/' .env
  fi
fi
if ! grep -q "R2_ENDPOINT" .env; then
  echo "WARNING: R2_ENDPOINT not found in .env. Please configure Cloudflare R2 variables in .env based on .env.example."
fi

# 3. Pre-build container images before taking down running services
echo "[3/4] Pre-building Docker images..."
docker compose build

# Backup current running image for automated rollback
docker tag sidprep-api:latest sidprep-api:previous 2>/dev/null || true

echo "Restarting services with updated build..."
docker compose down
docker compose up -d

# 4. Rigorous Health check with automated rollback
echo "[4/4] Verifying services status & readiness..."
HEALTH_URL="http://127.0.0.1:4000/v1/health"
MAX_RETRIES=10
RETRY_COUNT=0
HEALTHY=false

echo "Polling API health endpoint ($HEALTH_URL)..."
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  sleep 3
  if curl -s -f -o /dev/null "$HEALTH_URL"; then
    HEALTHY=true
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "Waiting for healthy response (attempt $RETRY_COUNT/$MAX_RETRIES)..."
done

if [ "$HEALTHY" = true ]; then
  echo "Health check passed! API is healthy."
  docker compose ps
else
  echo "ERROR: Health check failed after $MAX_RETRIES attempts! Initiating automated rollback..."
  docker compose down
  if docker image inspect sidprep-api:previous >/dev/null 2>&1; then
    docker tag sidprep-api:previous sidprep-api:latest
    docker compose up -d
    echo "Rollback to previous container image completed."
  fi
  exit 1
fi
echo ""
echo "========================================="
echo " Deployment Successfully Finished!"
echo "========================================="
