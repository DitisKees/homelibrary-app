# First F-Droid release procedure

This document describes the remaining steps for HomeLibrary's first official F-Droid submission. The prepared release candidate is Android `1.0.2` / versionCode `3`, with source tag `v1.0.2`.

## Version source of truth

Android release versions are defined in `app.json`:

```json
{
  "expo": {
    "version": "1.0.2",
    "android": {
      "versionCode": 3
    }
  }
}
```

For every later Android release:

1. increment `expo.version` according to the intended release;
2. increment `android.versionCode` monotonically, never reusing an old value;
3. add locale changelogs named `<versionCode>.txt` under `fastlane/metadata/android/<locale>/changelogs/`;
4. update the corresponding `.fdroid.yml` build entry and current-version fields;
5. run the release validations before creating the immutable source tag.

`package.json` is a private JavaScript package manifest and is not the Android release-version source of truth.

## Pre-release validation

After the release-preparation changes are merged to `main`, verify the exact candidate commit rather than tagging an earlier commit.

Run from a clean checkout:

```bash
npm ci
npx expo-doctor@latest
npm run audit:fdroid-npm
npm run validate:android-release
npm run validate:fdroid-metadata
npm run check:fdroid-icons
npm run typecheck
npm run lint
npm test
npm run build:web
npm run build:fdroid-android
```

The GitHub CI job runs the corresponding source-only Android path automatically. Do not create the release tag while required checks are failing.

## Capture real release screenshots

F-Droid can consume screenshots from upstream Fastlane metadata. Use the real Android release build rather than mockups so screenshots represent the application users will install.

Capture screenshots on a phone or representative Android emulator after connecting to a disposable/demo HomeLibrary backend. Do not expose a private household server URL, email address, authentication token, real person's reading history, loan data, or other household data.

For the first English listing, aim for four or five useful screenshots:

1. library/search view with representative demo books;
2. book detail view with cover and metadata;
3. add-book / ISBN workflow;
4. reading or lending view;
5. statistics or settings/self-hosting view where useful.

Store them in display order as, for example:

```text
fastlane/metadata/android/en-US/images/phoneScreenshots/01-library.png
fastlane/metadata/android/en-US/images/phoneScreenshots/02-book.png
fastlane/metadata/android/en-US/images/phoneScreenshots/03-add-book.png
fastlane/metadata/android/en-US/images/phoneScreenshots/04-reading-lending.png
fastlane/metadata/android/en-US/images/phoneScreenshots/05-statistics.png
```

English screenshots are sufficient for the initial submission if localized captures are not yet available. If localized screenshots are added later, use the equivalent `images/phoneScreenshots/` directory under `nl-NL`, `de-DE`, or `fr-FR`.

Review every image before committing it. The screenshots are public repository/store assets.

## Create the immutable source tag

Only after the release commit is merged, CI is green, and the desired screenshots are committed:

```bash
git switch main
git pull --ff-only
git status --short
node -p "require('./app.json').expo.version"
node -p "require('./app.json').expo.android.versionCode"
git tag -a v1.0.2 -m "HomeLibrary 1.0.2"
git push origin v1.0.2
```

Expected output before tagging:

```text
1.0.2
3
```

Never move, delete and recreate, or otherwise reuse a published release tag to point at different source. If a release candidate needs correction after tagging, prepare a new version and versionCode instead.

The repository's Docker publication workflow also listens for `vX.Y.Z` tags and checks the tag against `app.json` before publishing versioned self-hosting images.

## Test the upstream F-Droid recipe

The root `.fdroid.yml` is the development copy of the initial recipe. It intentionally has no `subdir` because Expo generates `android/` during the build.

Before submitting to the official repository, test with a current checkout of `fdroidserver`. The exact installation method may vary by development environment, but the relevant validation flow is:

```bash
fdroid readmeta
fdroid lint io.github.ditiskees.homelibrary
fdroid build -v -l io.github.ditiskees.homelibrary:3
```

For a realistic official-repository test, fork and clone `fdroiddata`, copy `.fdroid.yml` to:

```text
metadata/io.github.ditiskees.homelibrary.yml
```

Then run from the `fdroiddata` checkout:

```bash
fdroid readmeta
fdroid rewritemeta io.github.ditiskees.homelibrary
fdroid checkupdates --allow-dirty io.github.ditiskees.homelibrary
fdroid lint io.github.ditiskees.homelibrary
fdroid build -v -l io.github.ditiskees.homelibrary:3
```

Do not blindly commit changes made by `rewritemeta`; review them and keep the upstream `.fdroid.yml` and submitted metadata semantically aligned.

## What to verify in the F-Droid build

A successful Gradle task alone is not enough. Confirm that:

- the produced package is `io.github.ditiskees.homelibrary`;
- versionName is `1.0.2` and versionCode is `3`;
- target SDK remains 36;
- no Google Play Services, Firebase, ML Kit, or Google Play SDK dependency appears;
- Expo's bundled `local-maven-repo` directories were deleted before Android generation;
- Expo native modules are compiled from source;
- the F-Droid scanner reports no unexplained binary/proprietary artifacts;
- the APK installs and can connect to a self-hosted HomeLibrary backend;
- ISBN barcode scanning, manual ISBN entry, cover handling, authentication, reading status, and lending basics work in the built APK.

If the official buildserver exposes an additional dependency or scanner finding, fix or document that finding in the upstream source/recipe rather than weakening the scanner globally.

## Prepare the fdroiddata merge request

Once `v1.0.2` exists and the build succeeds with current `fdroidserver`:

1. create a branch in your `fdroiddata` fork;
2. add `metadata/io.github.ditiskees.homelibrary.yml` based on the tested `.fdroid.yml`;
3. make sure the upstream Fastlane metadata and screenshots are present in the tagged source;
4. run `fdroid readmeta`, `checkupdates`, `lint`, and the local build again;
5. open the merge request against `F-Droid/Data`;
6. reference the HomeLibrary source repository and issue tracker;
7. explain the Expo SDK 57 source-build choices from `MaintainerNotes`;
8. address reviewer and automated scanner feedback with upstream fixes where appropriate.

Do not create the official submission merge request until the recipe has actually built versionCode `3` from tag `v1.0.2`.

## After acceptance

Keep the release process predictable:

- bump `app.json` version/versionCode;
- add versionCode-named Fastlane changelogs;
- keep `.fdroid.yml`/fdroiddata metadata current until auto-update is proven reliable;
- run the source-only F-Droid build path before tagging;
- tag every release as immutable `v<versionName>`;
- monitor the first F-Droid build after each dependency/Expo SDK change, because native source-build requirements can change.
