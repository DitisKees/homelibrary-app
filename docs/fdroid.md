# F-Droid readiness

HomeLibrary is intended for distribution through the official F-Droid repository. The public source tree is being prepared so F-Droid can build the Android app without proprietary runtime dependencies or private build services.

F-Droid builds apps from publicly available source code and requires free/open-source dependencies. Proprietary dependencies such as Google Mobile Services are not accepted in the official repository.

## Barcode scanning

Android ISBN barcode scanning now uses a small local Expo module backed by ZXing Core 3.5.4, an Apache-2.0 licensed barcode library.

Expo Camera remains responsible for the camera preview and taking images, but its Android barcode-scanning feature is explicitly disabled with `barcodeScannerEnabled: false`. `expo-camera` is built from source so the disabled feature also removes its Google ML Kit / Play Services barcode dependencies from the generated Android dependency graph.

The Android scanner periodically captures a camera frame and decodes only EAN-13 barcodes through ZXing. Existing ISBN validation still runs before a scanned value is accepted. iOS continues to use Expo Camera's native EAN-13 scanning path.

CI verifies this configuration in three ways:

- repository validation requires Android Expo Camera barcode support to remain disabled and source-built;
- the generated Android runtime dependency graph must contain ZXing Core 3.5.4 and no Google Play Services, Firebase, ML Kit, or Google Play SDK artifacts;
- the generated Android project is compiled so the local Kotlin module is checked by Gradle/Kotlin, not only by TypeScript tooling.

Manual ISBN entry remains available if camera access is unavailable or scanning fails.

## Readiness checklist

- [x] Public source repository
- [x] GPL-3.0-or-later project license selected
- [x] No maintainer/private PocketBase endpoint embedded in repository configuration
- [x] Permanent Android application ID: `io.github.ditiskees.homelibrary`
- [x] Replace proprietary Android barcode-scanning dependency with a FLOSS implementation
- [x] Add an automated guard against Google Play Services / Firebase / ML Kit / Play SDK artifacts in the generated Android runtime graph
- [ ] Complete a broader dependency/license audit for all Android and JavaScript dependencies
- [ ] Establish and document a clean Android build that does not depend on EAS or private services
- [ ] Add upstream F-Droid/fastlane metadata, screenshots, and changelogs
- [ ] Create a tagged source release with stable `versionName` and `versionCode`
- [ ] Prepare and test the F-Droid build recipe
- [ ] Submit the app metadata/build recipe to `fdroiddata`

## Release discipline

F-Droid builds published releases from source rather than accepting an existing App Bundle. Public releases should therefore be tagged consistently and must contain all source and build instructions needed to reproduce the Android package from a clean checkout.
