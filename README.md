# HomeLibrary

HomeLibrary is a cross-platform client for managing a shared, self-hosted household book collection backed by PocketBase.

> **Release preparation:** **1.0.14 / base code 15 (ABI codes 151–154)** contains the keyboard fixes verified on a real ARM64 device. The official [F-Droid submission](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/48673) remains open. This version is prepared, not published: version-specific CI, immutable publication and all signed-reference checks must pass before updating that submission. Existing releases remain immutable.

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

HomeLibrary is early-stage software, but the current source is functional. Android releases use the pinned F-Droid buildserver/scanner path with two independent builds per ABI. The earlier 1.0.13 preparation demonstrated GitHub/GitLab unsigned parity on all four ABIs; each new release still requires its own build and signed-reference evidence. See `docs/fdroid.md`, `docs/fdroid-release.md`, and `docs/fdroid-harness.md` for the release gates.

The permanent Android application ID is:

```text
io.github.ditiskees.homelibrary
```

## Prerequisites

Android builds require Android 10 (API 29) or newer. Cover selection uses the system picker; cover capture requires camera access.

For application development:

- Node.js 22.13 or newer, but below Node 23
- npm
- PocketBase 0.40.6 for a manually run development backend

If you use `nvm`, run:

```bash
nvm use
```

## Self-hosting

**Docker Compose is the recommended deployment path.** Tagged releases publish separate PocketBase backend and static web images for amd64 and arm64, with persistent storage, health checks, runtime web endpoint configuration, and committed migrations.

See [`docs/self-hosting.md`](docs/self-hosting.md) for installation, first-superuser creation, household users, HTTPS/reverse proxy setup, upgrades, backups, restore drills, and Android first-run server configuration.

An optional **disposable public demo backend** for testers is documented in [`docs/demo-render.md`](docs/demo-render.md) (Render Free) and [`docs/demo-hosting.md`](docs/demo-hosting.md) (legacy Koyeb). It is not a hosted household service and must never be used for permanent data.

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

For the canonical source-only Android release path:

```bash
npm run build:fdroid-android
```

CI runs the fast source checks and web export, and verifies all committed PocketBase migrations against PocketBase 0.40.6. For Android changes, the F-Droid buildserver workflow owns native compilation, dependency checks, APK scanning, reproducibility and emulator startup verification. It builds two independent copies of each of the four ABIs in a buildserver image pinned by digest and requires each pair to match byte-for-byte. The harness also pins fdroidserver/fdroiddata revisions and derives temporary source metadata structurally with fdroidserver itself. The alternate Debian forky two-checkout reproducibility workflow remains available manually for diagnosis. Docker self-hosting changes run the backup/restore smoke test, then build each multi-architecture image once; pushes publish those builds to GHCR.

Workflow routing, stable status checks, cancellation and diagnostic conventions are documented in [docs/ci-workflows.md](docs/ci-workflows.md). Documentation-only and diagnostic-only changes run lightweight entry checks without starting the application build suites.

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

- Google Books is disabled by default, including on upgrades; enable it in Settings to allow requests;
- while disabled, ISBN lookup uses only Open Library, even if an API key is saved;
- when enabled without an API key, Open Library is tried first and Google Books is the fallback;
- when enabled with a locally configured API key, Google Books is tried first;
- recoverable provider/network/rate-limit failures fall through to the other provider;
- metadata lookup failures never prevent manual book entry.

A Google Books API key stored in a client application is not a secret. Apply appropriate restrictions and quotas if you configure one.

## F-Droid status

The initial official F-Droid submission is open as `fdroid/fdroiddata!48673`.

1. ~~replace the ML Kit barcode scanner with a fully FLOSS implementation~~ — completed with ZXing Core;
2. ~~audit the generated Android and npm dependency graph for non-free libraries~~ — completed;
3. ~~build Expo/React Native native modules from public source and verify reproducibility~~ — completed;
4. ~~add Fastlane metadata, screenshots, changelogs, permanent signing, and reproducible GitHub Release APKs~~ — completed;
5. ~~publish and verify reproducible upstream 1.0.7~~ — completed;
6. ~~fix the Gradle-properties append regression and add dependency/APK guards against ML Kit/Barhopper~~ — completed in 1.0.7;
7. ~~run the F-Droid production-buildserver image and live scanner in GitHub CI~~ — completed;
8. ~~require two independent GitHub-hosted F-Droid buildserver APKs to be byte-for-byte identical~~ — completed;
9. ~~sign the exact APK produced by the pinned upstream F-Droid buildserver path~~ — completed;
10. resolve the remaining GitHub-versus-GitLab runner reproducibility delta and require F-Droid signed-reference parity on the actual remote runner;
11. only then obtain official buildserver verification and acceptance.

See [`docs/fdroid.md`](docs/fdroid.md), [`docs/fdroid-release.md`](docs/fdroid-release.md), and [`docs/fdroid-harness.md`](docs/fdroid-harness.md) for details. The harness document records the architectural rules that prevent ad-hoc metadata rewriting and moving F-Droid toolchains from creeping back into CI.

## License

HomeLibrary is free software licensed under **GNU General Public License v3.0 or later (`GPL-3.0-or-later`)**. See [`LICENSE`](LICENSE).

## 1.0.14 release notes

Keyboard handling now covers server setup, login, Settings (server URL and Google
Books API key), all Add/Edit Book inputs, loan-entry fields, and Library search.
The authenticated navigator resizes above the Android keyboard, and longer forms
scroll their focused field into view. Browser scrolling stays browser-native,
and iOS retains padding-based avoidance without duplicate keyboard insets.
The author verified the fixes on a real ARM64 device using the PR #68 test APK.

Production APKs are signed with the permanent release key. PR test APKs use a
different test key and cannot update a production installation directly. Preserve
local settings before switching signing identities. The server-hosted library
is separate from local app settings. See [device checks](docs/android-release-smoke.md).
