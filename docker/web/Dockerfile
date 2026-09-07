# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM node:22.13.1-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts/generate-app-icons.mjs scripts/generate-app-icons.mjs
RUN npm ci

COPY . .
RUN npm run build:web

FROM nginxinc/nginx-unprivileged:1.30.4-alpine

LABEL org.opencontainers.image.source="https://github.com/DitisKees/homelibrary-app" \
      org.opencontainers.image.description="HomeLibrary static Expo web client"

COPY --chown=nginx:nginx --from=build /app/dist/ /usr/share/nginx/html/
COPY docker/web/default.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker/web/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh

ENV POCKETBASE_URL=""
EXPOSE 8080
