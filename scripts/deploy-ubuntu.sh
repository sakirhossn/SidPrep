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
  if grep -q "BREVO_SENDER_EMAIL=c0cb63001@smtp-brevo.com" .env; then
    sed -i 's/BREVO_SENDER_EMAIL=.*/BREVO_SENDER_EMAIL=no-reply@sidprep.in/' .env
  fi
  if grep -q "BREVO_SENDER_NAME=SidPrep Notifications" .env; then
    sed -i 's/BREVO_SENDER_NAME=.*/BREVO_SENDER_NAME=SidPrep/' .env
  fi
fi
if ! grep -q "R2_ENDPOINT" .env; then
  echo "Appending Cloudflare R2 credentials to .env..."
  cat << 'EOF' >> .env

# Cloudflare R2 Credentials
STORAGE_DRIVER=r2
R2_ENDPOINT=https://cbf7a4a2f0c78ae217205ffb1064ea54.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=1ffe7c761ee357af0998ece167f0ce6e
R2_SECRET_ACCESS_KEY=5a8e1264ec4ab149ecafb317eb1397ea8c0b9e9810109c87d8ca7733ba58e661
R2_BUCKET_NAME=sidprep-cdn-prod
R2_PUBLIC_DOMAIN=https://cdn.sidprep.in
R2_MONTHLY_QUOTA_BYTES=10737418240
EOF
fi

# 3. Build & restart Docker services
echo "[3/4] Rebuilding and launching Docker containers..."
docker compose down
docker compose up -d --build

# 4. Status check & Health check
echo "[4/4] Verifying services status..."
sleep 5
docker compose ps

echo "Checking API health endpoint (http://127.0.0.1:4000/v1/health)..."
if command -v curl &> /dev/null; then
  curl -s http://127.0.0.1:4000/v1/health || true
fi
echo ""
echo "========================================="
echo " Deployment Successfully Finished!"
echo "========================================="
