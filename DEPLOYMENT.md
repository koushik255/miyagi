# Self-hosting Miyagi

Miyagi is a web app with a Bun backend and a Vite frontend. A production instance needs to run on a server that is reachable by the people using it; building the frontend on a laptop is not enough. The backend serves the built frontend and the API together.

## What you need

- A Linux server (a small VPS is enough) with a public HTTPS domain.
- Node.js/npm, Bun, and Git.
- A GitHub account and a GitHub OAuth App created by you. Do not reuse the OAuth credentials from another Miyagi installation.

## 1. Put your copy on the server

Fork this repository into your own GitHub account, then clone your fork on the server:

```sh
git clone https://github.com/YOUR_GITHUB_USERNAME/miyagi.git
cd miyagi
```

If you are using a private fork, make sure the server can authenticate to GitHub before cloning and when pulling updates.

## 2. Create your own GitHub OAuth App

In GitHub, open **Settings → Developer settings → OAuth Apps → New OAuth App**. Use your production site for the homepage URL and register this callback URL:

```text
https://YOUR_DOMAIN/auth/github/callback
```

Existing installations already using `/auth/professor/github/callback` or `/auth/student/github/callback` can keep that URL; both legacy paths use the same role-aware callback handler.

Save the generated client ID and client secret. Miyagi uses GitHub for sign-in; it does not use a shared Miyagi GitHub connection.

## 3. Install and build

Install Node/npm and Bun on the server, then run:

```sh
npm ci
(cd back && bun install --frozen-lockfile)
npm run build
```

## 4. Configure the backend

Copy the environment template, edit the domain and GitHub credentials, and generate a state secret. Keep `back/.env` private and do not commit it:

```sh
cp back/.env.example back/.env
openssl rand -hex 32
# paste the generated value into GITHUB_OAUTH_STATE_SECRET in back/.env;
# it signs OAuth state and HttpOnly login sessions
```

`MIYAGI_DATA_ROOT` is the only storage setting. Miyagi puts `app.sqlite` and its disposable bare Git cache below that directory. Create it once and let the account running Bun own it:

```sh
sudo mkdir -p /var/lib/miyagi
sudo chown -R "$USER":"$USER" /var/lib/miyagi
```

## 5. Run the server

Start the backend from the repository’s `back` directory:

```sh
cd back
bun run src/index.ts
```

The app listens on port `3000` by default. Put it behind a reverse proxy such as Caddy or Nginx, terminate HTTPS there, and proxy requests to `127.0.0.1:3000`. Keep the backend running with a service manager such as `systemd` or Docker so it restarts after reboots.

Check the instance from the server or through the proxy:

```sh
curl https://YOUR_DOMAIN/api/health
```

It should return `{"ok":true}`. Then open `https://YOUR_DOMAIN` and test both Professor and Student GitHub sign-in.

## 6. Use your own GitHub repositories in Miyagi

After signing in as a professor, create a course and assignment. The professor adds repositories by entering complete **public GitHub repository URLs**, for example:

```text
https://github.com/student/project-one
```

For a batch import, enter one public repository URL per line in a `.txt` file. Students only need to keep their repository public and share its URL with the professor; they do not upload or connect a repository themselves.

## Updating

Pull changes from your fork, rebuild the frontend, reinstall backend dependencies if the lockfile changed, and restart the backend service:

```sh
git pull
npm ci
npm run build
(cd back && bun install --frozen-lockfile)
# restart your systemd/Docker service here
```

Back up `/var/lib/miyagi/app.sqlite` before upgrading or moving the instance. The `github_mirrors` directory is only a cache and can be regenerated from GitHub.
