# Set up Miyagi on DigitalOcean

This guide deploys Miyagi on an Ubuntu Droplet using its public IPv4 address. No domain or DNS configuration is required.

> The Docker deployment files must be committed and pushed to GitHub before a new Droplet can receive them with `git clone`.

## 1. Create the Droplet

In DigitalOcean:

1. Create an **Ubuntu 24.04 LTS** Droplet.
2. A Basic Droplet with approximately **1 vCPU and 2 GB RAM** is sufficient initially.
3. Use an SSH key for authentication.
4. Ensure the Droplet has a public IPv4 address.

Copy the public IPv4 address shown on the Droplet page. This guide uses `143.198.12.34` as an example. Replace it with your real address everywhere below.

## 2. Configure the firewall

Create or attach a DigitalOcean Cloud Firewall. DigitalOcean includes outbound
rules for all TCP, all UDP, and all ICMP traffic by default. Leave those default
outbound rules unchanged; you only need to configure the inbound rules below:

| Direction | Type | Port | Source |
| --- | --- | ---: | --- |
| Inbound | SSH | 22 | Your own IP address |
| Inbound | HTTP | 80 | All IPv4 and All IPv6 |

The existing outbound rules should allow all TCP, all UDP, and all ICMP traffic
to all IPv4 and IPv6 destinations. You do not need to add another outbound rule.

DigitalOcean Cloud Firewalls block incoming traffic that is not explicitly permitted. The HTTP preset opens TCP port 80. See the [DigitalOcean firewall documentation](https://docs.digitalocean.com/products/networking/firewalls/how-to/configure-rules/).

Port 443 is not required by this HTTP-only setup.

## 3. Create the GitHub OAuth App

In GitHub, open **Settings → Developer settings → OAuth Apps → New OAuth App**.

Using the example Droplet IP, enter:

```text
Application name: Miyagi
Homepage URL: http://143.198.12.34
Authorization callback URL: http://143.198.12.34/auth/github/callback
```

The callback must use the exact same IP and path that Miyagi uses. See the [GitHub OAuth documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

Create the app, generate a client secret, and keep these two values:

```text
GitHub client ID
GitHub client secret
```

## 4. Connect to the Droplet

```sh
ssh root@143.198.12.34
```

Install Git if necessary:

```sh
apt update
apt install -y git
```

Install Docker Engine and the Docker Compose plugin by following the [official Docker Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/).

Verify the installation:

```sh
docker --version
docker compose version
```

## 5. Download Miyagi

After the deployment files have been pushed to GitHub:

```sh
git clone https://github.com/koushik255/miyagi.git
cd miyagi
```

## 6. Configure the three values

Copy and open the configuration file:

```sh
cp .env.example .env
nano .env
```

The complete `.env` file looks like this:

```env
DROPLET_IP=143.198.12.34
GITHUB_OAUTH_CLIENT_ID=your-github-client-id
GITHUB_OAUTH_CLIENT_SECRET=your-github-client-secret
```

Replace the example IP and GitHub credentials with the real values. This is the only file users configure.

## 7. Start Miyagi

If the Droplet has only **512 MB of RAM**, create a 1 GB swap file before
building the Docker images. Without swap, the frontend build may run out of
memory and fail:

```sh
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

Make the swap file activate automatically after a reboot:

```sh
grep -qF '/swapfile none swap sw 0 0' /etc/fstab || echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab
```

This swap step is not normally necessary on the recommended 2 GB Droplet.

Now build and start Miyagi:

```sh
docker compose up -d --build
```

Docker Compose then:

1. Builds the React frontend.
2. Installs and starts the Bun backend.
3. Creates persistent database storage.
4. Starts Caddy.
5. Exposes Caddy on port 80.
6. Proxies requests from Caddy to Miyagi on the private Docker network.
7. Restarts both containers after a server reboot.

The backend automatically constructs this OAuth callback from `DROPLET_IP`:

```text
http://143.198.12.34/auth/github/callback
```

The backend's port 3000 is not publicly exposed.

## 8. Verify the deployment

```sh
docker compose ps
curl http://143.198.12.34/api/health
```

The health endpoint should return:

```json
{"ok":true}
```

Then open Miyagi in a browser:

```text
http://143.198.12.34
```

If the site does not open, check the logs:

```sh
docker compose logs --tail=100
```

Confirm that port 80 is open and that `.env` and the GitHub OAuth App use the same IP address.

## Update Miyagi later

```sh
cd ~/miyagi
git pull
docker compose up -d --build
```

The `.env` file and database remain unchanged.

## Back up the database

Stop the app briefly, copy the database, and start it again:

```sh
docker compose stop miyagi
docker compose cp miyagi:/data/app.sqlite ./miyagi-backup.sqlite
docker compose start miyagi
```

Keep `miyagi-backup.sqlite` somewhere outside the Droplet.

## About HTTP

This setup intentionally uses plain HTTP so it works directly with a Droplet IP and does not require a domain. Traffic and login sessions are not encrypted. It is suitable for initial testing; use a domain with HTTPS before using Miyagi for sensitive or public production data.
