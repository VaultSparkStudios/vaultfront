# VaultFront Runtime Deployment Runbook

This runbook covers the 8 manual steps required to bring the VaultFront gameplay
runtime online. The CI/CD pipeline (`deploy.yml`, `promote.yml`) handles all
subsequent deployments automatically — this runbook only needs to be executed once
per environment.

**Target URLs:**
- Gameplay: `https://play-vaultfront.vaultsparkstudios.com`
- API: `https://api-vaultfront.vaultsparkstudios.com`
- Public page: `https://vaultsparkstudios.com/vaultfront/` (already live)

---

## Prerequisites

- Hetzner account with billing enabled
- Cloudflare account with `vaultsparkstudios.com` zone access
- GitHub org admin access to `VaultSparkStudios/VaultFront`
- GHCR write access (to push Docker images)
- Local: `ssh-keygen`, `hcloud` CLI, `gh` CLI

---

## Step 1 — Provision the VPS

**Spec:** 4 vCPU / 8 GB RAM / 80 GB disk — Hetzner CX32 or equivalent.

```bash
# Using hcloud CLI (Hetzner)
hcloud server create \
  --name vaultfront-runtime \
  --type cx32 \
  --image ubuntu-24.04 \
  --location nbg1 \
  --ssh-key your-key-name
```

Note the server's public IPv4 address — needed in Steps 3 and 4.

**Manual Hetzner UI path:**
Servers → Create Server → Ubuntu 24.04 → CX32 → Nuremberg → Add SSH key → Create

---

## Step 2 — Prepare the VPS

SSH in and run:

```bash
ssh root@<VPS_IP>

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Install Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# Install Postgres + Redis
apt install -y postgresql redis-server
systemctl enable --now postgresql redis-server

# Create app user and deploy directory
useradd -m -s /bin/bash vaultfront
mkdir -p /opt/vaultfront
chown vaultfront:vaultfront /opt/vaultfront

# Allow vaultfront user to run docker
usermod -aG docker vaultfront
```

Upload the deploy scripts:

```bash
# From your local machine
scp update.sh root@<VPS_IP>:/opt/vaultfront/update.sh
ssh root@<VPS_IP> "chmod +x /opt/vaultfront/update.sh"
```

---

## Step 3 — Configure GitHub Secrets

In the GitHub UI: **Settings → Secrets and variables → Actions**

Add the following **Secrets**:

| Secret | Value |
|--------|-------|
| `DEPLOY_SERVER_HOST` | VPS public IPv4 from Step 1 |
| `DEPLOY_SSH_KEY` | Private SSH key content for the VPS deploy user |
| `GHCR_TOKEN` | GitHub PAT with `write:packages` scope |
| `API_KEY` | Internal API key shared with api-vaultfront service |
| `CF_ACCOUNT_ID` | Cloudflare account ID |
| `CF_API_TOKEN` | Cloudflare API token with Tunnel + DNS write scope |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret for the domain |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Your observability endpoint (or leave blank) |
| `OTEL_AUTH_HEADER` | Auth header for OTEL (or leave blank) |

Add the following **Variables**:

| Variable | Value |
|----------|-------|
| `DOMAIN` | `vaultsparkstudios.com` |
| `GHCR_REPO` | `vaultsparkstudios/vaultfront` |
| `GHCR_USERNAME` | Your GHCR org username |
| `DEPLOY_REMOTE_USER` | `vaultfront` |
| `DEPLOY_REMOTE_SCRIPT_PATH` | `/opt/vaultfront/update.sh` |

---

## Step 4 — Configure Postgres and Redis

```bash
ssh vaultfront@<VPS_IP>

# Postgres: create vaultfront DB and user
sudo -u postgres psql <<EOF
CREATE USER vaultfront WITH PASSWORD 'changeme';
CREATE DATABASE vaultfront OWNER vaultfront;
GRANT ALL PRIVILEGES ON DATABASE vaultfront TO vaultfront;
EOF

# Test connection
psql -U vaultfront -d vaultfront -c "SELECT 1;"

# Redis: verify it's running
redis-cli ping  # should return PONG
```

Update `/opt/vaultfront/.env` with:

```env
DATABASE_URL=postgres://vaultfront:changeme@localhost:5432/vaultfront
REDIS_URL=redis://localhost:6379
```

---

## Step 5 — Configure DNS Records

In Cloudflare DNS for `vaultsparkstudios.com`:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| `A` | `play-vaultfront` | `<VPS_IP>` | Proxied |
| `A` | `api-vaultfront` | `<VPS_IP>` | Proxied |

Or if using Cloudflare Tunnels (recommended for zero-trust):

```bash
# On VPS — create tunnels via cloudflared
cloudflared tunnel create vaultfront-play
cloudflared tunnel route dns vaultfront-play play-vaultfront.vaultsparkstudios.com

cloudflared tunnel create vaultfront-api
cloudflared tunnel route dns vaultfront-api api-vaultfront.vaultsparkstudios.com
```

---

## Step 6 — Configure Caddy

Write `/etc/caddy/Caddyfile` (or use `docs/templates/Caddyfile.studio-backend.template`):

```caddyfile
play-vaultfront.vaultsparkstudios.com {
  reverse_proxy localhost:8080
  encode gzip
}

api-vaultfront.vaultsparkstudios.com {
  reverse_proxy localhost:3000
  encode gzip
}
```

```bash
caddy reload --config /etc/caddy/Caddyfile
```

---

## Step 7 — Trigger the Deploy Workflow

1. Go to GitHub Actions → **Deploy** workflow
2. Click **Run workflow**
3. Set:
   - `target_environment`: `production`
   - `target_host`: `primary`
   - `target_subdomain`: `play-vaultfront`
4. Click **Run workflow**

The workflow will:
- Build and push the Docker image to GHCR
- SSH to the VPS and run `update.sh`
- Poll `https://play-vaultfront.vaultsparkstudios.com/commit.txt` until the commit SHA matches

Monitor the **Actions** tab for progress. Full deploy takes ~5–8 minutes.

---

## Step 8 — Swap Pages to the Real Client

Once the gameplay backend health check passes:

1. Go to GitHub Actions → **Deploy Pages** workflow
2. Change the deploy target from `pages-stub/` to the built `static/` output
3. Update `docs/DEPLOY_PAGES.md` to reflect the live state
4. Update `context/CURRENT_STATE.md` — remove the "Pending" flags for the runtime URLs

Optionally update `pages-stub/index.html` hero text from "Under Development" to
a live link pointing to `https://play-vaultfront.vaultsparkstudios.com`.

---

## Verification Checklist

```bash
# Health endpoint
curl https://play-vaultfront.vaultsparkstudios.com/api/health
# Expected: {"status":"ok"}

# Commit SHA matches deployed branch
curl https://play-vaultfront.vaultsparkstudios.com/commit.txt

# WebSocket connectivity (use wscat or browser dev tools)
wscat -c wss://play-vaultfront.vaultsparkstudios.com/lobbies

# Env config reachable
curl https://play-vaultfront.vaultsparkstudios.com/api/env
```

---

## Rollback

To rollback to the previous image tag:

1. Go to GitHub Actions → **Promote** workflow
2. Set `image_tag` to the previous known-good SHA or version tag
3. Set `target_subdomain` to `play-vaultfront`
4. Run — the promote workflow deploys without rebuild

Rollback takes ~2 minutes.
