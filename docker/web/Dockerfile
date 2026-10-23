# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM node:22.23.4-alpine AS build
WORKDIR /app

RUN apk add --no-cache git 'ca-certificates>=20261020-r0'
COPY package.json package-lock.json ./
COPY app.json ./
COPY patches/ patches/
COPY scripts/patch-expo-camera.mjs scripts/patch-expo-camera.mjs
COPY scripts/generate-app-icons.mjs scripts/generate-app-icons.mjs
COPY scripts/prepare-fastlane-icon.mjs scripts/prepare-fastlane-icon.mjs
RUN npm ci

COPY . .
RUN npm run build:web

FROM nginxinc/nginx-unprivileged:1.30.4-alpine

# Refresh the runtime trust store while keeping nginx unprivileged.
USER root
RUN apk add --no-cache 'ca-certificates>=20261020-r0'
USER 101

LABEL org.opencontainers.image.source="https://github.com/DitisKees/homelibrary-app" \
      org.opencontainers.image.description="HomeLibrary static Expo web client"

COPY --chown=nginx:nginx --from=build /app/dist/ /usr/share/nginx/html/
COPY docker/web/default.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker/web/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh

ENV POCKETBASE_URL=""
EXPOSE 8080
