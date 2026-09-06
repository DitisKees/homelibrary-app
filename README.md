# HomeLibrary

HomeLibrary is a cross-platform client for managing a shared, self-hosted household book collection backed by PocketBase.

> **F-Droid status:** HomeLibrary is being prepared for submission to the official F-Droid repository. The current Android barcode scanner uses Expo Camera's ML Kit integration, which does not meet F-Droid's fully-free dependency requirements. Barcode scanning will be replaced with a FLOSS implementation before the first F-Droid release.

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

## Development status

HomeLibrary is early-stage software. The current source snapshot is functional, but the Android build is not yet eligible for official F-Droid inclusion because its barcode-scanning path currently pulls in Google ML Kit / Play Services. See `docs/fdroid.md` and the repository issues for the remaining work.

The permanent Android application ID is:

```text
io.github.ditiskees.homelibrary
```

## Prerequisites

- Node.js 22.13 or newer, but below Node 23
- npm
- PocketBase 0.40.1 for the backend

If you use `nvm`, run:

```bash
nvm use
```

## Backend setup

The required PocketBase schema is versioned in `pocketbase/pb_migrations/`. See [`pocketbase/README.md`](pocketbase/README.md) for setup instructions and collection details.

Public self-registration is intentionally disabled. Household members are provisioned by the PocketBase administrator.

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

Start the app:

```bash
npm start
```

Useful checks before opening a pull request:

```bash
npx expo-doctor@latest
npm run validate:android-release
npm run typecheck
npm run lint
npm test
npm run build:web
```

CI runs these checks and verifies that all committed PocketBase migrations apply cleanly to a fresh PocketBase 0.40.1 database.

## Internationalization

The application currently supports:

- English (`en`)
- Dutch (`nl`)
- German (`de`)
- French (`fr`)

Translations live under `src/i18n/locales/`. The product name **HomeLibrary** is a brand name and is not translated.

## ISBN metadata providers

ISBN lookup supports Open Library and Google Books through a provider abstraction:

- without a Google Books API key, Open Library is tried first;
- with a locally configured Google Books API key, Google Books is tried first;
- recoverable provider/network/rate-limit failures fall through to the other provider;
- metadata lookup failures never prevent manual book entry.

A Google Books API key stored in a client application is not a secret. Apply appropriate restrictions and quotas if you configure one.

## F-Droid roadmap

Before submitting HomeLibrary to the official F-Droid repository we intend to:

1. replace the current ML Kit barcode scanner with a fully FLOSS implementation;
2. audit the generated Android dependency graph for non-free libraries;
3. ensure the Android app builds from a clean checkout without relying on EAS or private services;
4. add F-Droid/fastlane metadata, screenshots, and changelogs;
5. create tagged source releases suitable for F-Droid's build recipe.

See [`docs/fdroid.md`](docs/fdroid.md) for details.

## License

HomeLibrary is free software licensed under **GNU General Public License v3.0 or later (`GPL-3.0-or-later`)**. See [`LICENSE`](LICENSE).
