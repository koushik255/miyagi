# Deploy Miyagi on DigitalOcean

Miyagi runs on a Droplet with Docker Compose. You access it through the Droplet’s public IP address, so no domain or DNS setup is required.

## Before you start

You need:

- A DigitalOcean Droplet with Git, [Docker Engine, and Docker Compose](https://docs.docker.com/engine/install/).
- The Droplet’s public IPv4 address.
- Port **80** open in the DigitalOcean firewall.
- A GitHub account that can create an OAuth App.

You do **not** need to install Node.js, Bun, Caddy, Nginx, or a database. Docker provides everything the app needs, including Caddy.

## 1. Create a GitHub OAuth App

In GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**.

If the Droplet IP is `203.0.113.10`, enter:

```text
Application name: Miyagi
Homepage URL: http://203.0.113.10
Authorization callback URL: http://203.0.113.10/auth/github/callback
```

Replace `203.0.113.10` with your Droplet’s real public IP. Create the app, then generate a client secret.

Keep the GitHub **client ID** and **client secret** ready.

## 2. Enter the four settings

Connect to the Droplet and run:

```sh
git clone https://github.com/koushik255/miyagi.git
cd miyagi
cp .env.example .env
nano .env
```

`.env` is the only file you configure. Enter these four values:

```env
DROPLET_IP=203.0.113.10
GITHUB_OAUTH_CLIENT_ID=your-client-id
GITHUB_OAUTH_CLIENT_SECRET=your-client-secret
GITHUB_USERNAME=your-github-username
```

Use the same IP address that you entered in GitHub. Do not add `http://`, `https://`, or a path to `DROPLET_IP`.
Set `GITHUB_USERNAME` to the GitHub username of the first professor. This account
is the designated owner and can authorize other professor usernames at `/admin`.

Save the file and exit the editor.

## 3. Start Miyagi

```sh
docker compose up -d --build
```

That is the complete deployment. Docker builds Miyagi, starts the app and Caddy, restarts them after a reboot, and stores the database in a persistent volume.

Open this address in a browser:

```text
http://YOUR_DROPLET_IP
```

Students sign in at the main address. Professors sign in at:

```text
http://YOUR_DROPLET_IP/admin
```

## Check the deployment

```sh
docker compose ps
curl http://YOUR_DROPLET_IP/api/health
```

The health endpoint should return:

```json
{"ok":true}
```

If the site does not open, view the logs:

```sh
docker compose logs --tail=100
```

Check that port 80 is open and that `.env` and the GitHub OAuth App use the same IP address.

## Update Miyagi

```sh
cd miyagi
git pull
docker compose up -d --build
```

Docker keeps the existing `.env` file and database.

## Back up the database

Stop the app briefly, copy the database, and start it again:

```sh
docker compose stop miyagi
docker compose cp miyagi:/data/app.sqlite ./miyagi-backup.sqlite
docker compose start miyagi
```

Keep `miyagi-backup.sqlite` somewhere outside the Droplet.

## About HTTP

This setup intentionally uses HTTP so it works directly with a Droplet IP and requires no domain. Traffic is not encrypted. Use a domain with HTTPS before using Miyagi for sensitive or public production data.
