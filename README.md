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
cp back/.env.example back/.env
(cd back && bun install --frozen-lockfile)
```

Open `back/.env` and replace the two GitHub credential placeholders.

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
