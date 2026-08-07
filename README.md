# Miyagi

Miyagi helps professors organize courses and assignments, connect public student GitHub repositories, and review contribution activity.

## Run locally

You need Node.js, npm, Bun, and a GitHub OAuth App. Set the OAuth callback URL to:

```text
http://localhost:3000/auth/github/callback
```

Then install the app:

```sh
npm ci
cp .env.example .env
(cd back && bun install --frozen-lockfile)
```

Open the root `.env` file and replace the GitHub credential placeholders.
Set `GITHUB_USERNAME` to the GitHub username of the professor owner. Students
sign in at `/`; professors sign in and manage professor access at `/admin`.

`DROPLET_IP` is only required when using the included Docker Compose deployment.
If you run Miyagi directly behind a Cloudflare Tunnel, set the callback instead:

```env
GITHUB_OAUTH_REDIRECT_URI=https://YOUR_TUNNEL_HOSTNAME/auth/github/callback
```

Enter that exact HTTPS URL as the callback URL in the GitHub OAuth App as well.

Run the backend and frontend in separate terminals:

```sh
cd back && bun run dev
npm run dev
```

The frontend runs at `http://127.0.0.1:5173` and talks to the backend at `http://localhost:3000`.

## Verify

```sh
npm run build
npm run lint
cd back && bun test
```

## Deployment

See the [DigitalOcean setup guide](digital_ocean_setup.md) for the complete production deployment instructions.
