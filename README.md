# Miyagi

## Development

Run the backend locally:

```sh
cd back
bun run dev
```

Run the Electron frontend locally:

```sh
npm run dev
```

By default, the frontend uses `http://localhost:3000` and new group clone URLs are generated under `http://localhost:3000/git`.

Backend group repos and workspaces are stored under `/home/kous/extra` by default:

- `/home/kous/extra/group_repos`
- `/home/kous/extra/group_workspaces`

## Cloudflare Tunnel Mode

The Cloudflare Tunnel should point `https://miyagi.koushikkoushik.com` to the backend on `http://localhost:3000`.

When you want other networks to use the backend through the tunnel, start the backend with the public Git HTTP base URL:

```sh
cd back
bun run dev:tunnel
```

Then run the frontend pointed at the tunnel:

```sh
npm run dev:tunnel
```

For browser-only frontend development, use:

```sh
npm run dev:web:tunnel
```

The two relevant environment variables are:

- `VITE_MIYAGI_API_BASE`: frontend API base URL, for example `https://miyagi.koushikkoushik.com`
- `GIT_HTTP_BASE_URL`: backend Git clone URL base, for example `https://miyagi.koushikkoushik.com/git`
- `MIYAGI_DATA_ROOT`: backend data root for group repos and workspaces, defaults to `/home/kous/extra`

`GIT_HTTP_BASE_URL` is used when groups are created. Existing groups keep the clone URL that was stored when they were created.

## Vite Template Notes

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
# zhao
# test-test-test
