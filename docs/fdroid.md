# F-Droid readiness

HomeLibrary is intended for distribution through the official F-Droid repository. The public source tree is prepared so the Android release variant can be generated and compiled without proprietary runtime dependencies, EAS, private build services, private package registries, maintainer secrets, or Expo's bundled precompiled Android AARs.

F-Droid builds apps from publicly available source code and requires free/open-source dependencies. Proprietary dependencies such as Google Mobile Services are not accepted in the official repository.

See [`fdroid-dependencies.md`](./fdroid-dependencies.md) for the dependency/license audit and [`fdroid-release.md`](./fdroid-release.md) for the release, screenshot, tag, and `fdroiddata` procedure.

## Barcode scanning

Android ISBN barcode scanning uses a small local Expo module backed by ZXing Core 3.5.4, an Apache-2.0 licensed barcode library.

Expo Camera remains responsible for the camera preview and taking images, but its Android barcode-scanning feature is explicitly disabled with `barcodeScannerEnabled: false`. Android barcode decoding instead uses the local ZXing module, avoiding the optional Google ML Kit / Play Services barcode path.

The Android scanner periodically captures a camera frame and decodes only EAN-13 barcodes through ZXing. Existing ISBN validation still runs before a scanned value is accepted. iOS continues to use Expo Camera's native EAN-13 scanning path.

Manual ISBN entry remains available if camera access is unavailable or scanning fails.

## Expo native modules are source-built

Expo SDK 57 ships precompiled Android AARs inside `local-maven-repo` directories in installed packages. Those binaries are convenient for ordinary Expo builds but are not appropriate for the official F-Droid source-build path.

HomeLibrary therefore configures Expo Android autolinking with `buildFromSource: [".*"]`. Before the Android project is generated, `scripts/prepare-fdroid-source-tree.sh` removes all bundled `local-maven-repo` directories from `node_modules`. CI performs the same operation before its clean release build.

This means the F-Droid-oriented build proves that the native Expo modules used by HomeLibrary can be compiled from source instead of silently consuming bundled AARs.

## Automated safeguards

CI verifies the F-Droid configuration in several layers:

- every production npm package must have reviewed FLOSS license metadata and resolve from the public npm registry;
- Android Expo native modules must be configured to build from source;
- bundled Expo `local-maven-repo` directories are removed before Android generation;
- the generated Android **release** runtime dependency graph must contain ZXing Core 3.5.4 and no Google Play Services, Firebase, ML Kit, or Google Play SDK artifacts;
- Maven dependency groups outside the reviewed FOSS boundary fail CI pending explicit review;
- app icons must regenerate byte-identically from committed source;
- Fastlane metadata, changelogs, versionCode, app version, and `.fdroid.yml` must agree;
- a clean generated Android project must compile `:app:assembleRelease` without signing secrets;
- the resulting APK must retain package `io.github.ditiskees.homelibrary` and target SDK 36.

## Clean public source build

With Node.js 22.13.x, npm, JDK 17, Bash, and the Android SDK installed, a clean public checkout can run:

```bash
npm run build:fdroid-android
```

This removes any existing generated `android/` tree, installs the pinned npm dependencies, performs the npm/native F-Droid audits, validates release/store metadata, regenerates deterministic assets, removes bundled Expo Android AAR repositories, prebuilds Android from public configuration, compiles the release variant with Gradle, and verifies the produced APK. It does not use EAS or require private files, an Expo account, repository secrets, or a maintainer signing keystore.

The separate `Android release smoke` workflow may still use a test keystore to exercise APK signing. That workflow is not part of the F-Droid source-build path and its secrets are not required for an F-Droid-style build.

## Upstream F-Droid metadata

Fastlane-compatible metadata now lives under `fastlane/metadata/android/` for:

- English (`en-US`)
- Dutch (`nl-NL`)
- German (`de-DE`)
- French (`fr-FR`)

Each locale contains a title, short description, full description, and changelog for Android versionCode `3`.

Representative phone screenshots are intentionally not generated from mock UI. They must be captured from the actual release build, checked for private server URLs/account data, and committed under the appropriate locale's `images/phoneScreenshots/` directory before official submission. The screenshot plan is in [`fdroid-release.md`](./fdroid-release.md).

## Initial build recipe

The repository contains `.fdroid.yml` as an upstream development copy of the first F-Droid recipe. It targets HomeLibrary `1.0.2` / versionCode `3` and tag `v1.0.2`.

Important choices in the recipe are documented in `MaintainerNotes`:

- no `subdir`, because `android/` does not exist until Expo prebuild runs;
- all Expo native modules are compiled from source and bundled local Maven repositories are deleted;
- `node_modules` is scan-ignored rather than scan-deleted because the React Native/Expo source tree itself is required to compile the app;
- the build uses checksum-pinned Node.js 22.13.1 because Expo SDK 57 requires the Node 22.13.x line and the standard F-Droid Debian base does not provide that exact supported line;
- the existing HomeLibrary dependency guards are executed as part of recipe preparation.

The upstream recipe is not proof of acceptance by F-Droid. It still needs to be tested with current `fdroidserver`, adapted if the real buildserver reveals differences, and copied into `fdroiddata` as `metadata/io.github.ditiskees.homelibrary.yml` for the submission merge request.

## Release version

The next Android release candidate is:

```text
versionName: 1.0.2
versionCode: 3
tag: v1.0.2
```

`app.json` is the source of truth for the Android application version and versionCode. `package.json` describes the private JavaScript package and does not control the Android release tag. The Docker publication workflow also validates release tags against `app.json`.

Existing tags `v1.0.0` and `v1.0.1` must never be moved or reused. `v1.0.2` should only be created after this release-preparation branch is merged and the exact `main` commit has passed CI.

## Readiness checklist

- [x] Public source repository
- [x] GPL-3.0-or-later project license selected
- [x] No maintainer/private PocketBase endpoint embedded in repository configuration
- [x] Permanent Android application ID: `io.github.ditiskees.homelibrary`
- [x] Replace proprietary Android barcode-scanning dependency with a FLOSS implementation
- [x] Add an automated guard against Google Play Services / Firebase / ML Kit / Play SDK artifacts in the generated Android runtime graph
- [x] Complete a broader dependency/license audit for Android and JavaScript runtime dependencies
- [x] Establish and document a clean Android build that does not depend on EAS, private services, or maintainer secrets
- [x] Add CI safeguards so new npm license/source concerns and new native Maven groups require explicit review
- [x] Build Expo Android native modules from source and remove bundled precompiled AAR repositories
- [x] Add upstream Fastlane text metadata in the four supported UI languages
- [x] Add a versionCode-matched `1.0.2` changelog
- [x] Prepare an initial upstream `.fdroid.yml` recipe
- [x] Add CI validation for F-Droid metadata/version consistency
- [ ] Capture and commit representative real-device phone screenshots
- [ ] Merge the release candidate with all CI checks green
- [ ] Create the immutable `v1.0.2` source tag from the verified release commit
- [ ] Test the recipe using current `fdroidserver` / the F-Droid buildserver environment
- [ ] Submit `metadata/io.github.ditiskees.homelibrary.yml` to `fdroiddata`
- [ ] Address F-Droid review feedback and obtain the first successful official build

## Release discipline

F-Droid builds published releases from source rather than accepting an existing App Bundle. Every public Android release must therefore use a new monotonically increasing versionCode, an immutable `v<versionName>` source tag, and source/build instructions that reproduce the application without private inputs.
