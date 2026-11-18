# F-Droid readiness

HomeLibrary is intended for distribution through the official F-Droid repository. The Android release path is designed so F-Droid can build the application entirely from public source and, for reproducible releases, verify the upstream-signed APK before publishing that same APK.

See [`fdroid-dependencies.md`](./fdroid-dependencies.md) for the dependency/license audit, [`fdroid-release.md`](./fdroid-release.md) for the release and submission procedure, [`fdroid-harness.md`](./fdroid-harness.md) for the build-harness architecture and maintenance rules, and [`android-release-signing.md`](./android-release-signing.md) for production signing.

## Current F-Droid candidate

The prepared, not-yet-published F-Droid candidate is:

```text
versionName: 1.0.14
base versionCode: 15
ABI versionCodes: 151, 152, 153, 154
tag: v1.0.14
```

`v1.0.7` / versionCode 8 is immutable and its source builds successfully on F-Droid, but its published signed APK does not reproduce F-Droid's buildserver output. The published 1.0.9 APK subsequently failed the binary scanner on disabled Google barcode references. Version 1.0.10 removed those references and added strict APK scanning gates; 1.0.11 introduced R8 and ABI-specific packaging; all existing tags and APKs remain immutable. For this candidate, upstream will sign the exact unsigned APK produced by the same F-Droid buildserver/scanner path used for official verification.

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

Upstream CI runs two independent F-Droid buildserver source builds for each ABI as the automatic Android build and reproducibility gate. The alternate Debian trixie two-clean-checkout workflow is available manually for checkout-path and toolchain diagnosis. The harness pins the buildserver image by digest plus exact fdroidserver/fdroiddata commits, derives source-test metadata structurally with fdroidserver itself, runs the live scanner and `fdroid build --refresh-scanner --on-server`, and requires both unsigned APKs to be byte-for-byte identical before release. Release verification is a separate path that uses canonical `.fdroid.yml` unchanged. These checks prove determinism on the GitHub-hosted harness, not automatic parity with F-Droid's GitLab SaaS runner.

### Official Glide KSP reproducibility fix

The earlier workaround for Expo Image's Glide 5.0.5 processor is documented in [PR #47](https://github.com/DitisKees/homelibrary-app/pull/47) and the historical evidence in fdroid-harness.md. Glide [5.0.8](https://github.com/bumptech/glide/releases/tag/v5.0.8) restored deterministic module sorting; the same fix is included in [5.0.9](https://github.com/bumptech/glide/releases/tag/v5.0.9).

Expo Image still requests 5.0.5 and Expo SDK 57 compiles against Android API 36. The Android AARs from Glide 5.0.8 and 5.0.9 require compileSdk 37, as confirmed by the upstream release notes and the production build's AAR metadata check. Do not upgrade the SDK/AGP or suppress that check for a processor-only reproducibility fix.

The Expo config plugin applies scripts/glide-version.gradle to upgrade only com.github.bumptech.glide:ksp in :expo-image to the official 5.0.9 JVM JAR; runtime Glide and integrations retain 5.0.5. Upstream source comparison shows the annotation API is unchanged and the processor's runtime references are unchanged apart from the deterministic ordering fix and formatting. Its processor-classpath annotations resolve independently at 5.0.9. Mixed-version compatibility is a candidate hypothesis requiring successful native compilation and runtime/reproducibility tests, not an upstream guarantee. Older transitive runtime requests still use normal Gradle conflict resolution. The audit rejects selected runtime versions other than 5.0.5, selected processor Glide versions other than 5.0.9, or changed direct Expo Image declarations. Remove the override when Expo ships a fixed compatible Glide release. No custom processor build, srclib, local Maven mirror, JAR normalization or Glide scanner exception is needed.

The prebuild dependency audit runs the project-owned Gradle tasks homeLibraryVerifyGlideKsp and homeLibraryVerifyGlideRuntime, checking the declared Expo coordinates, selected runtime graph and actual KSP processor classpath. The stock KSP POM uses Kotlin 2.2.10, KotlinPoet 1.12.0 and KSP API 2.0.20-1.0.25. Full native/toolchain compatibility, independent GitHub and GitLab byte-for-byte APK equality, scanner checks and cover-image device testing are release gates, not implied by the upstream fix alone.

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

The official fdroiddata submission is already open as `fdroid/fdroiddata!48673`. Version 1.0.7 exposed a cross-environment reproducibility gap; the current recipe retains those fixes and the barcode scanner corrections. The 1.0.14 candidate adds device-verified keyboard handling, but still needs version-specific release verification before the MR is updated:

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

The inclusion/Anti-Features review declares `NonFreeNet` because ISBN metadata
lookup can use proprietary Google Books when explicitly enabled in Settings.
It is disabled by default, including on upgrades with a saved key. When enabled,
Google Books is the fallback without a key; a configured key moves it first. Core library/manual entry use the
self-hostable PocketBase backend; see the release process for this disclosure.

## November 2026 recipe hardening and Debian Node simplification

Issue #65 initially pinned individual Debian Forky packages. F-Droid's later
clarification asks for Debian nodejs/npm, not maintained pins of individual
Debian npm modules. Follow the accepted
[Read Me recipe](https://gitlab.com/fdroid/fdroiddata/-/blob/master/metadata/io.loopstring.readme.yml):
add the live Forky source, update apt, and install only nodejs and npm explicitly
with `apt-get install -y -t forky nodejs npm`. APT resolves their dependencies.
Application dependencies still come exclusively from `npm ci`.

The upstream Android release and independent F-Droid build use the same
recipe and pinned buildserver inputs. Both F-Droid reviewers explicitly
[accepted live, unpinned Forky](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/48673#note_4259297241)
on 17 November 2026. Do not introduce a Debian snapshot or individual package
allowlist. The live archive can drift: the signed-reference comparison rejects
a mismatching APK, and future source builds can fail. Run the production
buildserver simulation before tagging and record actual installed versions.
Never rewrite a previous release tag or APK.

The development baseline is Node 24.22.2 in `.nvmrc`, also used by regular
GitHub CI and the web Docker image. `scripts/check-node-toolchain.mjs` rejects
older or different-major versions and reports npm. The official Node
distribution bundles npm 11.19.1; the successful 17 November buildserver
preflight resolved Debian npm 12.2.2 (not a pin).
Do not mistake matching Node versions for identical npm implementations.
Android signed-reference parity depends on the Debian buildserver recipe,
not the developer's local npm. Update `.nvmrc`, the web Docker base,
package engines and security regression test together on Node upgrades.

The Android release and GitLab build must use identical recipe commands;
publish a new release only after green candidate checks, then independently
compare all four signed APKs in GitLab.

The candidate uses the official Glide dependencies described above. The prebuild audit checks that all relevant Glide modules resolve consistently and that the official KSP processor is present. No custom Maven repository or processor-specific scanner exception is required.

The scanner deletion list is based on the last successful GitLab build log:
unused Apple prebuilds/macros, non-Linux Hermes, bundled dotSlash executables,
Expo's template archive, React Native's Apple language packs/publishing script,
ZXing WASM and the specific Gradle plugin build outputs created by prebuild.
F-Droid already removes Gradle wrappers itself. Unexpected paths outside these
reviewed locations fail scanning. The source-build harness runs a real scanner
regression that deletes reviewed WASM but rejects and preserves a new unreviewed
AAR. Every full F-Droid build still runs the live scanner after prebuild.

The lockfile also refreshes compatible security patches, including shell-quote,
Undici, node-forge, source-map-js, decode-uri-component and brace-expansion.
The old global glob 13 override is advanced to 14.0.3 to match current Expo tools.
Remaining npm audit findings require separate compatibility review; no forced
major-version downgrade or incompatible Zod replacement is applied.

Validation of every subsequent candidate, including 1.0.14, must include the normal CI gate, the two
independent buildserver copies for each ABI, emulator startup, and an independent
GitLab source build. A release tag and submitted metadata must follow successful
candidate checks; signed-reference comparisons require the published release
assets. Do not claim a previous version's results as signed-reference evidence for a new candidate.

The toolchain preflight executes the actual Debian installation commands, reports package versions, then
runs `npm ci --ignore-scripts` on the candidate lockfile before the ABI matrix.
Normal CI and production builds still exercise postinstall.
