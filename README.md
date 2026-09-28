# HomeLibrary

HomeLibrary is a cross-platform client for managing a shared, self-hosted household book collection backed by PocketBase.

> **F-Droid status:** The official `fdroid/fdroiddata!48673` submission is open. HomeLibrary 1.0.5 is published upstream as a developer-signed reproducible release. F-Droid review requested that native `externalNativeBuild` configuration and APK-normalization logic live in the upstream repository rather than inline metadata. The next candidate is **1.0.6 / versionCode 7**, which applies that build-system cleanup without user-facing feature changes.

## Features

- Search and browse a shared household library
- Add and edit books manually or by ISBN
- ISBN metadata lookup through Open Library and optionally Google Books
- Cover selection, camera capture, resize/compression, and upload
- Personal reading status
- Lending and returned-loan history
- Library, reading, and lending statistics
- Realtime refresh when other household members change shared data
- English, Dutch, German, and French UI
- Runtime configuration of the self-hosted PocketBase server
- HTTPS-only remote server policy in release builds
- OS-backed secure native authentication storage

## Development status

HomeLibrary is early-stage software, but the current source is functional and the Android release path is reproducible and prepared for F-Droid review. See `docs/fdroid.md` and the open `fdroid/fdroiddata!48673` submission for the remaining publication work.

The permanent Android application ID is:

```text
io.github.ditiskees.homelibrary
```

## Prerequisites

For application development:

- Node.js 22.13 or newer, but below Node 23
- npm
- PocketBase 0.40.1 for a manually run development backend

If you use `nvm`, run:

```bash
nvm use
```

## Self-hosting

**Docker Compose is the recommended deployment path.** Tagged releases publish separate PocketBase backend and static web images for amd64 and arm64, with persistent storage, health checks, runtime web endpoint configuration, and committed migrations.

See [`docs/self-hosting.md`](docs/self-hosting.md) for installation, first-superuser creation, household users, HTTPS/reverse proxy setup, upgrades, backups, restore drills, and Android first-run server configuration.

The manual PocketBase procedure remains available in [`pocketbase/README.md`](pocketbase/README.md).

Public self-registration is intentionally disabled. Household members are provisioned by the PocketBase administrator.

Before using HomeLibrary as an authoritative household library, follow the production baseline in [`docs/security-and-backups.md`](docs/security-and-backups.md), including HTTPS, rate limiting, superuser hardening, scheduled off-host backups, and a tested restore procedure.

## App setup

Install dependencies:

```bash
npm ci
```

You can either configure a development default server:

```bash
cp .env.example .env
```

and set `EXPO_PUBLIC_POCKETBASE_URL`, or leave it unset. With no build-time server configured, HomeLibrary opens the server-setup screen on first launch.

The production web container uses `POCKETBASE_URL` at **container startup**, so the same web image can be repointed to another PocketBase server without rebuilding the Expo bundle. A user-selected endpoint in HomeLibrary still takes precedence over that deployment default.

Release builds require HTTPS for remote PocketBase endpoints. Development builds may use plain HTTP only for localhost, Android emulator host mappings, and private LAN development addresses.

Start the app:

```bash
npm start
```

Useful checks before opening a pull request:

```bash
npx expo-doctor
npm run validate:android-release
npm run validate:fdroid-metadata
npm run typecheck
npm run lint
npm test
npm run build:web
```

For the complete source-only Android release path used to approximate the F-Droid build environment:

```bash
npm run build:fdroid-android
```

CI runs these checks, verifies all committed PocketBase migrations against PocketBase 0.40.1, and validates the Docker self-hosting path when deployment-related files change.

## Authentication storage

Native Android/iOS builds persist PocketBase authentication state using Expo SecureStore (Android Keystore / iOS Keychain) rather than ordinary AsyncStorage. Existing native installs from before this change deliberately discard the old plain `pb_auth` entry and require one sign-in after upgrading.

Web builds use browser-backed storage because SecureStore has no web equivalent.

## Internationalization

The application currently supports:

- English (`en`)
- Dutch (`nl`)
- German (`de`)
- French (`fr`)

Translations live under `src/i18n/locales/`, with server/security translations in `src/i18n/serverTranslations.ts`. The product name **HomeLibrary** is a brand name and is not translated.

## ISBN metadata providers

ISBN lookup supports Open Library and Google Books through a provider abstraction:

- without a Google Books API key, Open Library is tried first;
- with a locally configured Google Books API key, Google Books is tried first;
- recoverable provider/network/rate-limit failures fall through to the other provider;
- metadata lookup failures never prevent manual book entry.

A Google Books API key stored in a client application is not a secret. Apply appropriate restrictions and quotas if you configure one.

## F-Droid status

The initial official F-Droid submission is open as `fdroid/fdroiddata!48673`.

1. ~~replace the ML Kit barcode scanner with a fully FLOSS implementation~~ — completed with ZXing Core;
2. ~~audit the generated Android and npm dependency graph for non-free libraries~~ — completed;
3. ~~build Expo/React Native native modules from public source and verify reproducibility~~ — completed;
4. ~~add Fastlane metadata, screenshots, changelogs, permanent signing, and reproducible GitHub Release APKs~~ — completed;
5. ~~publish and verify reproducible upstream 1.0.5~~ — completed;
6. move F-Droid-specific native build configuration and APK normalization out of inline metadata and into checked-in upstream files — in progress for **1.0.6 / versionCode 7**;
7. tag and publish 1.0.6 after all CI/reproducibility checks are green, then update !48673 to the exact source SHA and APK;
8. obtain a successful F-Droid buildserver verification and acceptance.

See [`docs/fdroid.md`](docs/fdroid.md) and [`docs/fdroid-release.md`](docs/fdroid-release.md) for details.

## License

HomeLibrary is free software licensed under **GNU General Public License v3.0 or later (`GPL-3.0-or-later`)**. See [`LICENSE`](LICENSE).
