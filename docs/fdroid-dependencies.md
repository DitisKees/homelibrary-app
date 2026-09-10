# F-Droid dependency audit

This document records the dependency review boundary for the Android application distributed from this repository. It complements `package-lock.json`, which is the authoritative exact npm inventory, and the generated Gradle release runtime graph.

The audit is intentionally enforced in CI so dependency changes cannot silently bypass review.

## JavaScript/runtime dependencies

All direct runtime npm dependencies currently declared by HomeLibrary are free/open-source and use the MIT license. Exact resolved versions and every production transitive package are pinned by `package-lock.json` and checked by `npm run audit:fdroid-npm`.

| Dependency | Declared version | Purpose | License |
| --- | --- | --- | --- |
| `@react-native-async-storage/async-storage` | `2.2.0` | Non-sensitive local app storage | MIT |
| `@react-navigation/bottom-tabs` | `7.18.18` | Bottom-tab navigation | MIT |
| `@react-navigation/native` | `7.3.18` | Navigation core | MIT |
| `@react-navigation/native-stack` | `7.18.10` | Native-stack navigation | MIT |
| `@tanstack/react-query` | `^5.28.0` | Server-state/query cache | MIT |
| `expo` | `~57.0.21` | Expo runtime and native-module framework | MIT |
| `expo-blob` | `^57.0.1` | Blob support | MIT |
| `expo-camera` | `~57.0.4` | Camera preview and image capture | MIT |
| `expo-file-system` | `~57.0.6` | Local file access | MIT |
| `expo-image` | `~57.0.4` | Image rendering | MIT |
| `expo-image-manipulator` | `~57.0.16` | Cover-image manipulation | MIT |
| `expo-image-picker` | `~57.0.16` | Local image selection | MIT |
| `expo-localization` | `~57.0.1` | Locale detection | MIT |
| `expo-secure-store` | `~57.0.3` | Native credential storage | MIT |
| `expo-status-bar` | `~57.0.1` | Status-bar integration | MIT |
| `i18next` | `^26.4.2` | Localization core | MIT |
| `pocketbase` | `^0.21.3` | PocketBase API client | MIT |
| `react` | `19.2.3` | UI runtime | MIT |
| `react-dom` | `19.2.3` | Web React renderer | MIT |
| `react-i18next` | `^17.0.13` | React localization bindings | MIT |
| `react-native` | `0.86.3` | Android/iOS application runtime | MIT |
| `react-native-gesture-handler` | `~2.32.0` | Native gestures | MIT |
| `react-native-safe-area-context` | `~5.7.0` | Safe-area handling | MIT |
| `react-native-screens` | `~4.26.0` | Native navigation screens | MIT |
| `react-native-web` | `~0.21.0` | Web React Native compatibility | MIT |

### Automated npm review

`scripts/check-fdroid-npm-dependencies.mjs` checks every non-development `node_modules/*` entry in the npm v3 lockfile, not only the direct list above. It fails when:

- a production package has no reviewable license expression;
- a license identifier is outside the explicitly reviewed FLOSS-license set;
- a runtime package resolves from somewhere other than the public npm registry;
- a package name matches a known suspect family such as Firebase, ML Kit, Play Services, Google Sign-In, or Google Mobile Ads;
- a direct runtime dependency is not represented in the lockfile.

The command prints the exact resolved version/license for each direct dependency and the license expressions observed across the production lockfile. A new license family therefore requires an explicit source/license review and policy change.

Development-only tooling is not part of the distributed Android application and is excluded from the runtime-license gate. It remains pinned in `package-lock.json` and is still built from public sources in CI.

## Android/native dependency review

The Android project is generated from committed Expo configuration and local source. The repository does not commit a mutable `android/` tree.

Material native/runtime components are:

| Component/family | Role | License status |
| --- | --- | --- |
| Local `modules/expo-zxing-scanner` source | Android ISBN scanner bridge | Project source, GPL-3.0-or-later |
| `com.google.zxing:core:3.5.4` | EAN-13 decoding | Apache-2.0 |
| React Native / Expo native modules (`com.facebook.*` plus source-built Expo modules) | Core Android runtime and native APIs | FLOSS; primarily MIT |
| AndroidX (`androidx.*`) | Android compatibility/runtime libraries | Apache-2.0 |
| Material Components (`com.google.android.material`) | Android UI support used by the generated stack | Apache-2.0 |
| Kotlin / kotlinx (`org.jetbrains.*`) | Kotlin runtime/coroutines used by native modules | Apache-2.0 |
| Square libraries (`com.squareup.*`) | HTTP/I/O support such as OkHttp/Okio | Apache-2.0 |
| Google FOSS utility families (`com.google.code.*`, `com.google.guava`, `com.google.errorprone`, `com.google.j2objc`) | Open-source Java/Android support libraries | FLOSS; Apache/BSD-family depending on artifact |
| `javax.*`, `org.apache.*`, `org.bouncycastle`, `org.jspecify`, `org.webkit` reviewed groups | Supporting Java/Android runtime artifacts when present | FLOSS; reviewed group boundary |

`scripts/check-fdroid-android-dependencies.sh` resolves **`releaseRuntimeClasspath`**, writes a normalized exact Maven-coordinate inventory to `android/build/fdroid-release-runtime-dependencies.txt`, and applies two independent gates:

1. Google Play Services, Firebase, ML Kit, and Google Play SDK coordinate families are always forbidden.
2. Every external Maven coordinate must belong to a group prefix listed in `scripts/fdroid-reviewed-native-groups.txt`. A new group fails CI until its upstream source and license are reviewed.

The group file is a review boundary rather than a blanket assertion that all future artifacts in those namespaces are acceptable. Dependency updates still require normal review of the generated coordinate inventory.

Expo Camera is source-built and configured with `barcodeScannerEnabled: false`; this prevents its optional Android ML Kit barcode path from entering the generated runtime graph. Android barcode decoding instead uses the reviewed ZXing Core dependency.

## Clean public Android source build

### Prerequisites

A build machine needs only public tooling and repositories:

- Git;
- Node.js 22.13.x and npm;
- JDK 17;
- an Android SDK containing the API/build tools needed by Expo SDK 57 (the produced app currently targets API 36);
- Bash;
- network access to the public npm and Android/Gradle/Maven repositories used by the open-source toolchain.

No Expo account, EAS build service, private npm registry, PocketBase server, maintainer file, signing keystore, or repository secret is required.

From a clean checkout, run:

```bash
npm run build:fdroid-android
```

The command deliberately removes any existing generated `android/` directory and then:

1. installs the exact npm lockfile with `npm ci`;
2. audits all production npm packages and licenses;
3. validates release-critical application configuration;
4. verifies deterministic generation of the committed-source app icons;
5. generates a fresh Android project with Expo prebuild;
6. audits the Gradle **release** runtime dependency graph;
7. builds `:app:assembleRelease` directly with Gradle;
8. verifies the built APK package name is `io.github.ditiskees.homelibrary` and `targetSdkVersion` is 36.

The local artifact is written to:

```text
android/app/build/outputs/apk/release/app-release.apk
```

The build intentionally does not inject the maintainer/test signing material used by the separate `Android release smoke` workflow. F-Droid signs repository builds itself; the purpose here is to prove that the public source can produce the release variant without private inputs.

Normal pull-request CI performs the same audit/prebuild/release-build checks from GitHub's clean checkout with read-only repository permissions and no maintainer signing secrets.

## Deterministic generated assets

Configured app icon PNGs are ignored build outputs. `npm ci` creates them using the committed `scripts/generate-app-icons.mjs`, which uses only Node.js standard-library code and committed drawing constants.

`scripts/check-fdroid-icons.mjs` hashes the generated files, runs the generator again, and requires byte-identical SHA-256 hashes. This guards against generated app artwork depending on local/private input or nondeterministic generation.

## What this audit does not claim

This issue establishes a source-build and dependency-review baseline; it does not yet claim bit-for-bit reproducible APKs across arbitrary machines. Gradle/Android tool versions and the future F-Droid recipe still need to be pinned as required by the final `fdroiddata` submission.

It also does not replace human review when an existing dependency changes license, source availability, or behavior without changing its Maven/npm namespace. Dependency-update PRs should review upstream release/license changes as well as the automated gates.

## Remaining official F-Droid work

After this audit/source-build milestone, the remaining work is intentionally release/submission work:

- add F-Droid/fastlane metadata, screenshots, and changelogs;
- create the first stable public source tag with matching version metadata;
- write and test the `fdroiddata` build recipe with pinned build tooling;
- submit the recipe/metadata to the official F-Droid repository and address review feedback.
