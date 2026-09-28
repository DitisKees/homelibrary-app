# F-Droid readiness

HomeLibrary is intended for distribution through the official F-Droid repository. The Android release path is designed so F-Droid can build the application entirely from public source and, for reproducible releases, verify the upstream-signed APK before publishing that same APK.

See [`fdroid-dependencies.md`](./fdroid-dependencies.md) for the dependency/license audit, [`fdroid-release.md`](./fdroid-release.md) for the release and submission procedure, and [`android-release-signing.md`](./android-release-signing.md) for production signing.

## Current release candidate

The next release is:

```text
versionName: 1.0.6
versionCode: 7
tag: v1.0.6
```

`v1.0.5` / versionCode 6 is the currently published reproducible upstream release. During review of the open fdroiddata submission, the F-Droid maintainer requested that Python not be embedded in metadata and that `externalNativeBuild` configuration live upstream. Version 1.0.6 implements that review feedback while preserving the same reproducible native build design.

`app.json` is the source of truth for Android versionName and versionCode. `package.json` remains the private JavaScript package manifest.

## Barcode scanning

Android ISBN barcode scanning uses the local Expo module backed by ZXing Core 3.5.4 (Apache-2.0). Expo Camera provides the camera preview, while its Android ML Kit barcode path is disabled with `barcodeScannerEnabled: false`. Manual ISBN entry remains available.

## Source-only native build

Expo SDK 57 can ship precompiled Android AARs in package-local Maven repositories. HomeLibrary configures Expo Android autolinking with `buildFromSource: [".*"]`, removes bundled `local-maven-repo` directories before prebuild, and compiles the release APK from source. `plugins/with-reproducible-native-builds.js` is the checked-in source of truth for the generated Gradle `externalNativeBuild` CMake prefix maps; fdroiddata no longer patches that block.

The canonical build entry point is:

```bash
npm run build:fdroid-android
```

The script stages source-controlled inputs at the fixed `/tmp/homelibrary-fdroid-source` path, installs pinned npm dependencies, runs the FLOSS/native dependency guards, performs Expo prebuild, builds the unsigned release APK, and verifies package metadata. The fixed path removes checkout-location differences from native ELF objects.

Upstream CI independently builds the same commit from two clean checkouts and requires the unsigned APKs to be byte-for-byte identical.

## Production signing and reproducible verification

The production signing workflow keeps signing outside Gradle and outside the F-Droid source build:

1. build the canonical unsigned APK;
2. sign it with the permanent upstream key using Android build-tools 34.0.0 `apksigner`;
3. verify the configured certificate fingerprint;
4. keep a normal GitHub Actions artifact for manual runs;
5. for an immutable `vX.Y.Z` tag, publish `HomeLibrary-X.Y.Z.apk` to that GitHub Release.

The upstream F-Droid recipe contains:

```text
Binaries: https://github.com/DitisKees/homelibrary-app/releases/download/v%v/HomeLibrary-%v.apk
```

F-Droid can therefore rebuild the source and compare its output with the versioned upstream APK. The official `fdroiddata` recipe already contains `AllowedAPKSigningKeys` using the independently verified lower-case SHA-256 certificate fingerprint. Keep that signing identity unchanged for 1.0.5 and later updates.

The production signing key itself is never committed or published.

## Metadata and store assets

Fastlane-compatible metadata exists for English, Dutch, German, and French. Each locale contains title, short description, full description, and versionCode-named changelogs.

The English listing also contains four representative real-app phone screenshots and a deterministic `icon.png` generated from the same source as the application icon.

## Automated safeguards

CI verifies, among other things:

- reviewed FLOSS license/provenance for production npm packages;
- no Google Play Services, Firebase, ML Kit, or Play SDK runtime artifacts;
- Expo native modules build from source;
- bundled Expo local Maven repositories are removed;
- deterministic application/store icon generation;
- F-Droid metadata, changelogs, versionName and versionCode agree;
- the upstream recipe delegates to the shared canonical build script;
- the reproducible binary URL uses the versioned GitHub Release asset;
- the release workflow publishes only version-matched tagged releases;
- the unsigned APK retains package `io.github.ditiskees.homelibrary` and target SDK 36.

## F-Droid submission status

The official fdroiddata submission is already open as `fdroid/fdroiddata!48673`. Version 1.0.5 is published and verified; the current review feedback requires one build-system-only follow-up release:

- [x] Public GPL-3.0-or-later source repository
- [x] Permanent Android application ID
- [x] FLOSS Android barcode scanning
- [x] Dependency/license audit and non-free dependency guards
- [x] Clean public Android source build
- [x] Expo native modules built from source
- [x] Fastlane metadata and real screenshots
- [x] Deterministic upstream unsigned builds
- [x] Permanent production signing workflow
- [x] Reproducible 1.0.5 GitHub Release APK verified
- [x] F-Droid maintainer review: keep Python and `externalNativeBuild` logic upstream
- [ ] Merge the 1.0.6 review-fix PR with all checks green
- [ ] Create immutable `v1.0.6` from that exact main commit
- [ ] Verify the signed `HomeLibrary-1.0.6.apk` and existing certificate fingerprint
- [ ] Update fdroiddata !48673 to versionCode 7/full source SHA with no embedded Python
- [ ] Obtain a successful F-Droid buildserver verification and acceptance

## Release discipline

Never move or recreate a published `v<versionName>` tag. Every Android release gets a new monotonically increasing versionCode and an immutable source tag. If a tagged candidate needs correction, prepare a new version instead.
