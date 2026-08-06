FROM node:24-alpine AS frontend

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM oven/bun:1-alpine AS backend-dependencies

WORKDIR /app/back
COPY back/package.json back/bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine

RUN apk add --no-cache ca-certificates git

WORKDIR /app/back
COPY --from=backend-dependencies /app/back/node_modules ./node_modules
COPY back/package.json ./
COPY back/src ./src
COPY --from=frontend /app/dist /app/dist

ENV FRONTEND_DIST_PATH=/app/dist
ENV MIYAGI_DATA_ROOT=/data

EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]

