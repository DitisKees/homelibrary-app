# F-Droid readiness

HomeLibrary is intended for distribution through the official F-Droid repository, but the current Android source tree is not ready for submission yet.

F-Droid builds apps from publicly available source code and requires free/open-source dependencies. Proprietary dependencies such as Google Mobile Services are not accepted in the official repository.

## Current blocker: barcode scanning

`src/components/BarcodeScannerButton.tsx` currently uses Expo Camera's Android barcode-scanning support. That path pulls in Google ML Kit / Play Services barcode libraries in the generated Android application.

Before an official F-Droid submission, barcode scanning must be replaced with a fully FLOSS implementation.

Acceptance criteria for the replacement:

- EAN-13 ISBN scanning remains available;
- the Android release dependency graph contains no Google ML Kit / Play Services barcode-scanning libraries;
- taking book-cover photos continues to work;
- manual ISBN entry remains available;
- automated tests cover the new scanner integration where practical;
- the app can be built from a clean public source checkout using command-line tooling.

## Readiness checklist

- [x] Public source repository
- [x] GPL-3.0-or-later project license selected
- [x] No maintainer/private PocketBase endpoint embedded in repository configuration
- [x] Permanent Android application ID: `io.github.ditiskees.homelibrary`
- [ ] Replace proprietary barcode-scanning dependency with a FLOSS implementation
- [ ] Audit the generated Android dependency graph for non-free libraries
- [ ] Establish and document a clean Android build that does not depend on EAS or private services
- [ ] Add upstream F-Droid/fastlane metadata, screenshots, and changelogs
- [ ] Create a tagged source release with stable `versionName` and `versionCode`
- [ ] Prepare and test the F-Droid build recipe
- [ ] Submit the app metadata/build recipe to `fdroiddata`

## Release discipline

F-Droid builds published releases from source rather than accepting our existing EAS/Google Play App Bundle. Public releases should therefore be tagged consistently and must contain all source and build instructions needed to reproduce the Android package from a clean checkout.
