# Miyagi

## Install

```sh
npm install
cd back
bun install
```

## Run

Start the local API:

```sh
cd back
bun run dev
```

Start the Electron app against the local API:

```sh
npm run dev
```

Or run the web app only:

```sh
npm run dev:web
```

## GitHub OAuth

Set these on the backend before using GitHub login:

```sh
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...
GITHUB_STUDENT_OAUTH_REDIRECT_URI=http://localhost:3000/auth/student/github/callback
GITHUB_OAUTH_STATE_SECRET=replace-with-a-random-dev-secret
```

Professor repository access still uses `GITHUB_OAUTH_REDIRECT_URI`, usually:

```sh
GITHUB_OAUTH_REDIRECT_URI=http://localhost:3000/auth/professor/github/callback
```

## Check

```sh
npm run build
npm run lint
```
