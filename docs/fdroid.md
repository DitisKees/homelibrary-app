# F-Droid readiness

HomeLibrary is intended for distribution through the official F-Droid repository. The Android release path is designed so F-Droid can build the application entirely from public source and, for reproducible releases, verify the upstream-signed APK before publishing that same APK.

See [`fdroid-dependencies.md`](./fdroid-dependencies.md) for the dependency/license audit, [`fdroid-release.md`](./fdroid-release.md) for the release and submission procedure, [`fdroid-harness.md`](./fdroid-harness.md) for the build-harness architecture and maintenance rules, and [`android-release-signing.md`](./android-release-signing.md) for production signing.

## Current F-Droid candidate

The next F-Droid candidate is:

```text
versionName: 1.0.11
base versionCode: 12
ABI versionCodes: 121, 122, 123, 124
tag: v1.0.10
```

`v1.0.7` / versionCode 8 is immutable and its source builds successfully on F-Droid, but its published signed APK does not reproduce F-Droid's buildserver output. The published 1.0.9 APK subsequently failed the binary scanner on disabled Google barcode references. Version 1.0.10 removed those references and added strict APK scanning gates; 1.0.11 adds R8 and ABI-specific packaging; all existing tags and APKs remain immutable. For this candidate, upstream will sign the exact unsigned APK produced by the same F-Droid buildserver/scanner path used for official verification.

`app.json` is the source of truth for Android versionName and the base versionCode. Actual APK codes are `10 * base + ABI suffix` (1–4); see [the release process](fdroid-release.md). `package.json` remains the private JavaScript package manifest.

## Barcode scanning

Android ISBN barcode scanning uses the local Expo module backed by ZXing Core 3.5.4 (Apache-2.0). Expo Camera provides the camera preview, while its Android ML Kit barcode path is disabled with `barcodeScannerEnabled: false` and its Google barcode source references are removed by the reviewed pinned patch. See `fdroid-apk-scanner.md`. Manual ISBN entry remains available.

## Source-only native build

Expo SDK 57 can ship precompiled Android AARs in package-local Maven repositories. HomeLibrary configures Expo Android autolinking with `buildFromSource: [".*"]`, removes bundled `local-maven-repo` directories before prebuild, and compiles the release APK from source. `plugins/with-reproducible-native-builds.js` is the checked-in source of truth for the generated Gradle `externalNativeBuild` CMake prefix maps; fdroiddata no longer patches that block.

The canonical build entry point is:

```bash
npm run build:fdroid-android
```

The script stages source-controlled inputs at the fixed `/tmp/homelibrary-fdroid-source` path, installs pinned npm dependencies, runs the FLOSS/native dependency guards, performs Expo prebuild, builds the unsigned release APK, and verifies package metadata. The fixed path removes checkout-location differences from native ELF objects.

Upstream CI retains the existing two-clean-checkout Android reproducibility check and also runs two independent F-Droid buildserver source builds. The harness pins the buildserver image by digest plus exact fdroidserver/fdroiddata commits, derives source-test metadata structurally with fdroidserver itself, runs the live scanner and `fdroid build --refresh-scanner --on-server`, and requires both unsigned APKs to be byte-for-byte identical before release. Release verification is a separate path that uses canonical `.fdroid.yml` unchanged. These checks prove determinism on the GitHub-hosted harness, not automatic parity with F-Droid's GitLab SaaS runner.

### Glide KSP reproducibility backport

Expo Image resolves Glide 5.0.5's KSP processor. Cross-runner diagnostics isolated a nondeterministic iteration in Glide's `LibraryGlideModules.parseUnique`: the generated `GlideIndexer` could enumerate library modules in a different order on GitHub and GitLab, changing downstream DEX output.

HomeLibrary keeps the stock Glide 5.0.5 runtime and backports only deterministic ordering to the KSP processor. `scripts/build-glide-ksp-repro.sh` checks out the immutable Glide 5.0.5 tag, applies the one-line ordering fix, builds the processor from source, normalizes only JAR ZIP metadata, and creates a local Maven mirror using Glide's unmodified published POM. `scripts/glide-ksp-repro.init.gradle` restricts that mirror to `com.github.bumptech.glide:ksp:5.0.5`, so no other dependency can be shadowed.

The focused proof generated the same Glide indexer on independent GitHub and GitLab environments, SHA-256 `bb57a537b3084dc8845d11f01e167df3c61675a22ffbc7655f1f9de60e41627a`. The production F-Droid recipe builds this processor during the network-enabled init phase using explicit Debian JDK 11/17 toolchains; the Android release itself remains on the buildserver's Java 21 baseline.

## Production signing and reproducible verification

The production signing workflow keeps signing outside Gradle, but the unsigned artifact is now built by the F-Droid buildserver path itself:

1. build the unsigned APK in `buildserver-trixie` using the live scanner and the checked-in fdroid recipe;
2. export that exact unsigned APK from the buildserver job;
3. sign it with the permanent upstream key using Android build-tools 34.0.0 `apksigner`;
4. publish `HomeLibrary-X.Y.Z-<abi>.apk` for the immutable tag;
5. run F-Droid again in release mode with `Binaries` and `AllowedAPKSigningKeys` intact, requiring its own signature-copy/reference-binary verification to pass.

The upstream F-Droid recipe contains:

```text
binary: https://github.com/DitisKees/homelibrary-app/releases/download/v%v/HomeLibrary-%v-arm64-v8a.apk
```

F-Droid can therefore rebuild the source and compare its output with the versioned upstream APK. The official `fdroiddata` recipe already contains `AllowedAPKSigningKeys` using the independently verified lower-case SHA-256 certificate fingerprint. Keep that signing identity unchanged for 1.0.5 and later updates.

The production signing key itself is never committed or published.

## Metadata and store assets

Fastlane-compatible metadata exists for English, Dutch, German, and French. Each locale contains title, short description, full description, and versionCode-named changelogs.

The English listing also contains four representative real-app phone screenshots and a deterministic `icon.png` generated from the same source as the application icon.

## Automated safeguards

CI verifies, among other things:

- reviewed FLOSS license/provenance for production npm packages;
- no Google Play Services, Firebase, ML Kit, or Play SDK runtime dependencies;
- the built APK itself contains no Barhopper native library, ML Kit barcode models, or Google barcode-scanner metadata;
- Expo Camera's generated `expo.camera.barcode-scanner-enabled=false` Gradle property remains intact after release-only Gradle settings are appended;
- Expo native modules build from source;
- bundled Expo local Maven repositories are removed;
- deterministic application/store icon generation;
- F-Droid metadata, changelogs, versionName and versionCode agree;
- `.fdroid.yml` remains the single canonical release recipe;
- source-test metadata is derived structurally with fdroidserver rather than regex/string editing;
- the F-Droid image, fdroidserver revision, and fdroiddata baseline are pinned and never updated during a build;
- source-build and released-version verification use separate runners;
- the checked-in recipe matches the F-Droid buildserver path used for production release APKs;
- the reproducible binary URL uses the versioned GitHub Release asset;
- the release workflow publishes only version-matched tagged releases;
- two independent F-Droid production-buildserver runs produce identical unsigned APKs;
- scanner-sensitive React Native Gradle files remain intact through reviewed `scanignore` entries;
- the signed GitHub Release APK passes F-Droid's own reference-binary/signature-copy verification;
- the unsigned APK retains package `io.github.ditiskees.homelibrary` and target SDK 36.

## F-Droid submission status

The official fdroiddata submission is already open as `fdroid/fdroiddata!48673`. Version 1.0.7 exposed a cross-environment reproducibility gap; version 1.0.11 retains the verified fixes for that gap and removes the barcode references found by the binary scanner before the MR is updated:

- [x] Public GPL-3.0-or-later source repository
- [x] Permanent Android application ID
- [x] FLOSS Android barcode scanning
- [x] Dependency/license audit and non-free dependency guards
- [x] Clean public Android source build
- [x] Expo native modules built from source
- [x] Fastlane metadata and real screenshots
- [x] Deterministic upstream unsigned builds
- [x] Permanent production signing workflow
- [x] Diagnose why the 1.0.7 signed APK differs from F-Droid's successful source rebuild
- [x] F-Droid maintainer review: keep Python and `externalNativeBuild` logic upstream
- [x] Diagnose 1.0.5/1.0.6 ML Kit packaging regression in generated Gradle properties
- [x] Merge the 1.0.7 regression-fix PR with all checks green
- [x] Create immutable `v1.0.7` and publish/verify the signed APK
- [x] Update fdroiddata !48673 to versionCode 8/full source SHA
- [x] Require two independent GitHub-hosted F-Droid buildserver APKs to match
- [x] Publish the signed APK from the pinned upstream F-Droid buildserver path
- [x] Resolve the GitHub-versus-GitLab runner reproducibility delta (`classes.dex`, `resources.arsc`, `baseline.prof`)
- [ ] Require post-publication F-Droid signed-reference parity to pass on the actual remote runner
- [ ] Only then obtain official acceptance

## Release discipline

Never move or recreate a published `v<versionName>` tag. Every Android release gets a new monotonically increasing versionCode and an immutable source tag. If a tagged candidate needs correction, prepare a new version instead.

The F-Droid harness itself is governed by [`fdroid-harness.md`](./fdroid-harness.md). In particular, do not reintroduce regex-based YAML editing, moving `git pull` inputs, `apt dist-upgrade` inside the pinned buildserver, or a combined source/release mode script.
