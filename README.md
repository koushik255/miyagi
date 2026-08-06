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

## Backend structure

Backend operations return `Effect` values, including SQLite queries, GitHub requests, OAuth, filesystem access, and Git commands. Routes compose those operations and execute them once at the Hono response boundary, where typed `AppError` failures become HTTP responses. GitHub login establishes a signed HttpOnly session; protected routes derive identity and ownership from that cookie rather than trusting IDs supplied by the browser. The pure dashboard calculation functions remain ordinary TypeScript because they have no side effects or failure channel.

## Verify

```sh
npm run build
npm run lint
cd back && bun test
```

## Deployment

See the [DigitalOcean setup guide](digital_ocean_setup.md) for the complete production deployment instructions.
