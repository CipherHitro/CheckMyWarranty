#!/bin/bash
# Runs once, automatically, the first time the instance boots (EC2 user_data).
# Output is logged to /var/log/cloud-init-output.log — check there first if
# anything doesn't come up.
set -euxo pipefail

DOMAIN="${domain_name}"
CERTBOT_EMAIL="${certbot_email}"
REPO_URL="${github_repo_url}"
S3_BUCKET="${s3_bucket_name}"
AWS_REGION="${aws_region}"
APP_DIR="/home/ubuntu/CheckMyWarranty"

# ---------------------------------------------------------------------------
# 1. Base packages
# ---------------------------------------------------------------------------
apt-get update -y
apt-get install -y ca-certificates curl gnupg git nginx certbot python3-certbot-nginx awscli

# ---------------------------------------------------------------------------
# 2. Swap memory (required for Docker + Redis workloads on small instances)
# ---------------------------------------------------------------------------
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# ---------------------------------------------------------------------------
# 3. Docker (official apt repo)
# ---------------------------------------------------------------------------
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$${VERSION_CODENAME}") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker ubuntu

# ---------------------------------------------------------------------------
# 4. Pull the app
# ---------------------------------------------------------------------------
sudo -u ubuntu git clone "$REPO_URL" "$APP_DIR"
cd "$APP_DIR"

# ---------------------------------------------------------------------------
# 5. Backend .env — single source of truth from Terraform variables
# ---------------------------------------------------------------------------
cat > "$APP_DIR/backend/.env" <<EOF
DATABASE_URL=${database_url}
mode=production
AWS_REGION=${aws_region}
AWS_S3_BUCKET=${s3_bucket_name}
%{ for key, value in app_env_vars ~}
${key}=${value}
%{ endfor ~}
EOF
chown ubuntu:ubuntu "$APP_DIR/backend/.env"

# ---------------------------------------------------------------------------
# 6. Nginx — base HTTP config first, Certbot upgrades it to HTTPS below
# (mirrors the config you were already running)
# ---------------------------------------------------------------------------
cat > /etc/nginx/sites-available/checkmywarranty <<EOF
server {
    server_name $DOMAIN;

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;

        # Long timeouts for the SSE stream
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;
    }

    listen 80;
}
EOF
ln -sf /etc/nginx/sites-available/checkmywarranty /etc/nginx/sites-enabled/checkmywarranty
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ---------------------------------------------------------------------------
# 7. TLS cert — restore from S3 backup if this isn't truly the first boot
# ever (avoids burning Let's Encrypt's weekly issuance limit every time you
# destroy/recreate the instance), otherwise issue a fresh one and store it.
# ---------------------------------------------------------------------------
if aws s3 cp "s3://$S3_BUCKET/infra-backup/letsencrypt.tar.gz" /tmp/letsencrypt.tar.gz --region "$AWS_REGION" 2>/dev/null; then
  echo "Restoring existing certificate from S3 backup"
  tar -xzf /tmp/letsencrypt.tar.gz -C /
  nginx -t && systemctl reload nginx
else
  echo "No backup found — issuing a fresh certificate (make sure DNS already points at this instance's Elastic IP)"
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect
  tar -czf /tmp/letsencrypt.tar.gz /etc/letsencrypt
  aws s3 cp /tmp/letsencrypt.tar.gz "s3://$S3_BUCKET/infra-backup/letsencrypt.tar.gz" --region "$AWS_REGION"
fi

# Keep the S3 backup fresh after each automatic renewal too
cat > /etc/letsencrypt/renewal-hooks/deploy/backup-to-s3.sh <<EOF
#!/bin/bash
tar -czf /tmp/letsencrypt.tar.gz /etc/letsencrypt
aws s3 cp /tmp/letsencrypt.tar.gz s3://$S3_BUCKET/infra-backup/letsencrypt.tar.gz --region $AWS_REGION
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/backup-to-s3.sh

# ---------------------------------------------------------------------------
# 8. Bring the app up and run migrations
# ---------------------------------------------------------------------------
cd "$APP_DIR/backend"
docker compose -f docker-compose.prod.yml up -d --build

# Wait for the app container to actually be ready before migrating
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T app node -e "process.exit(0)" 2>/dev/null; then
    break
  fi
  sleep 2
done

docker compose -f docker-compose.prod.yml exec -T app npx prisma migrate deploy

echo "Bootstrap complete."
