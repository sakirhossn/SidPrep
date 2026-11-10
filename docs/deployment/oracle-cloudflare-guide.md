# SidPrep 2.0 Oracle Cloud & Cloudflare Production Deployment Runbook

## 1. Hosting Reality & Capacity Assessment

### Oracle Cloud Infrastructure (OCI) Always Free
The current Always Free tenancy allocation provides:
- **Compute:** Up to 3,000 OCPU-hours and 18,000 GB-hours per month for Arm-based Ampere A1 Compute, which accommodates **2 Ampere A1 OCPUs and 12 GB RAM** continuously without charge.
- **Storage:** 200 GB combined Block Volume storage (boot + data volume).
- **Network Outbound:** 10 TB/month free outbound transfer.

### Cloudflare Free Tier & R2 Standard
- **DNS & CDN:** Free Tier with automatic DDoS mitigation and origin TLS.
- **R2 Storage:** 10 GB-month of standard storage free; 1,000,000 Class A write operations/month and 10,000,000 Class B read operations/month.

### Brevo Transactional Email
- **Capacity:** 300 emails/day free limit.
- **Priority Enforcement:** Essential student login OTPs are strictly prioritized. Broadcast alerts are rate-limited to avoid exhausting the 300-email threshold.

---

## 2. Server Provisioning & Docker Setup on Oracle Linux / Ubuntu (ARM64)

### Step 2.1: System Dependencies
```bash
# Update package indices
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker & Docker Compose plugin
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
```

### Step 2.2: Firewall & Ingress Rules
In OCI Console > Virtual Cloud Network (VCN) > Security Lists:
- Ingress Rule 1: Source `0.0.0.0/0`, TCP Port `80` (HTTP)
- Ingress Rule 2: Source `0.0.0.0/0`, TCP Port `443` (HTTPS)
- Keep Port `5432` (PostgreSQL) strictly internal (blocked from public internet).

On the VM:
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## 3. Automated Daily Database Backups (pg_dump + Rotation)

Create a backup script at `/opt/sidprep/scripts/backup-db.sh`:
```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/opt/sidprep/backups/postgres"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/sidprep_db_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

# Execute pg_dump within the running container
docker exec -t sidprep_postgres pg_dump -U sidprep_user sidprep_db | gzip > "${BACKUP_FILE}"

# Retention: Remove local backups older than 14 days
find "${BACKUP_DIR}" -type f -name "sidprep_db_*.sql.gz" -mtime +14 -delete

echo "[Backup] Completed: ${BACKUP_FILE}"
```

Make executable and register with system crontab:
```bash
chmod +x /opt/sidprep/scripts/backup-db.sh
# Run daily at 03:00 IST (21:30 UTC)
(crontab -l 2>/dev/null; echo "30 21 * * * /opt/sidprep/scripts/backup-db.sh >> /var/log/sidprep_backup.log 2>&1") | crontab -
```

---

## 4. Cloudflare DNS & Security Rules

1. **DNS Settings:**
   - `sidprep.in` -> A Record -> `<Oracle_VM_Public_IP>` (Proxied: Yes)
   - `api.sidprep.in` -> A Record -> `<Oracle_VM_Public_IP>` (Proxied: Yes)

2. **SSL/TLS Mode:**
   - Set to **Full (Strict)** in Cloudflare dashboard.

3. **Cache Rules (CRITICAL FOR ADMIN & USER PRIVACY):**
   - Create Rule 1: Expression `(http.request.uri.path contains "/admin")` -> Cache Eligibility: **Bypass Cache**.
   - Create Rule 2: Expression `(http.host eq "api.sidprep.in")` -> Cache Eligibility: **Bypass Cache**.

4. **Security / WAF:**
   - Enable Cloudflare Bot Fight Mode (Free).
   - Rate limit rule on `/v1/auth/*`: Max 10 requests per minute per IP.
