# F-Droid readiness

HomeLibrary is intended for distribution through the official F-Droid repository. The public source tree is prepared so the Android release variant can be generated and compiled without proprietary runtime dependencies, EAS, private build services, private package registries, or maintainer secrets.

F-Droid builds apps from publicly available source code and requires free/open-source dependencies. Proprietary dependencies such as Google Mobile Services are not accepted in the official repository.

See [`fdroid-dependencies.md`](./fdroid-dependencies.md) for the dependency/license audit, automated review policy, prerequisites, and clean Android source-build instructions.

## Barcode scanning

Android ISBN barcode scanning uses a small local Expo module backed by ZXing Core 3.5.4, an Apache-2.0 licensed barcode library.

Expo Camera remains responsible for the camera preview and taking images, but its Android barcode-scanning feature is explicitly disabled with `barcodeScannerEnabled: false`. `expo-camera` is built from source so the disabled feature also removes its Google ML Kit / Play Services barcode dependencies from the generated Android dependency graph.

The Android scanner periodically captures a camera frame and decodes only EAN-13 barcodes through ZXing. Existing ISBN validation still runs before a scanned value is accepted. iOS continues to use Expo Camera's native EAN-13 scanning path.

CI verifies this configuration together with the broader F-Droid audit:

- repository validation requires Android Expo Camera barcode support to remain disabled and source-built;
- every production npm package must have reviewed FLOSS license metadata and resolve from the public npm registry;
- the generated Android **release** runtime dependency graph must contain ZXing Core 3.5.4 and no Google Play Services, Firebase, ML Kit, or Google Play SDK artifacts;
- Maven dependency groups outside the reviewed FOSS boundary fail CI pending explicit review;
- app icons must regenerate byte-identically from committed source;
- a clean generated Android project must compile `:app:assembleRelease` without signing secrets;
- the resulting APK must retain package `io.github.ditiskees.homelibrary` and target SDK 36.

Manual ISBN entry remains available if camera access is unavailable or scanning fails.

## Clean public source build

With Node.js 22.13.x, npm, JDK 17, Bash, and the Android SDK installed, a clean public checkout can run:

```bash
npm run build:fdroid-android
```

This removes any existing generated `android/` tree, installs the pinned npm dependencies, performs the npm/native F-Droid audits, regenerates deterministic assets, prebuilds Android from public configuration, compiles the release variant with Gradle, and verifies the produced APK. It does not use EAS or require private files, an Expo account, repository secrets, or a maintainer signing keystore.

The separate `Android release smoke` workflow may still use a test keystore to exercise APK signing. That workflow is not part of the F-Droid source-build path and its secrets are not required for an F-Droid-style build.

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
- [ ] Add upstream F-Droid/fastlane metadata, screenshots, and changelogs
- [ ] Create a tagged source release with stable `versionName` and `versionCode`
- [ ] Prepare and test the F-Droid build recipe
- [ ] Submit the app metadata/build recipe to `fdroiddata`

## Release discipline

F-Droid builds published releases from source rather than accepting an existing App Bundle. Public releases should therefore be tagged consistently and must contain all source and build instructions needed to reproduce the Android package from a clean checkout.

This repository now establishes the dependency and source-build baseline. The next milestones are release metadata/tagging and the actual `fdroiddata` recipe/submission.
