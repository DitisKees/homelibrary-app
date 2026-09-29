# F-Droid release procedure

This document describes the release path for HomeLibrary's upstream-signed reproducible F-Droid publication. The current candidate is Android `1.0.8` / versionCode `9`, with intended immutable tag `v1.0.8`.

`v1.0.7` / versionCode 8 is already published and remains immutable. F-Droid can build its source successfully, but the resulting unsigned APK differs from the published 1.0.7 APK because the upstream release and F-Droid buildserver used different Java/native build paths. Version 1.0.8 fixes the process by making the F-Droid buildserver output the authoritative unsigned release artifact.

## Version source of truth

Android release versions are defined in `app.json`:

```json
{
  "expo": {
    "version": "1.0.8",
    "android": {
      "versionCode": 9
    }
  }
}
```

For every later Android release:

1. increment `expo.version`;
2. increment `android.versionCode` monotonically;
3. add `<versionCode>.txt` changelogs under all supported Fastlane locales;
4. update the upstream `.fdroid.yml` build/current-version fields;
5. run the complete release validations;
6. create the immutable source tag only from the exact green `main` commit.

`package.json` is not the Android version source of truth.

## Pre-release validation

From a clean checkout of the exact release candidate:

```bash
npm ci
npx expo-doctor
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

The pinned repository `expo-doctor` version must be used; do not use `@latest` in release validation. GitHub CI, the two-clean-checkout reproducibility workflow, and the `F-Droid buildserver simulation` workflow must all be green before tagging or updating fdroiddata.

## Store metadata

The real English phone screenshots are already committed under:

```text
fastlane/metadata/android/en-US/images/phoneScreenshots/
```

The deterministic application icon is also committed as:

```text
fastlane/metadata/android/en-US/images/icon.png
```

Do not replace these with mock UI or screenshots containing private server URLs, household data, email addresses, tokens, or other private information.

## Create the immutable source tag

After the release-preparation PR is merged and the exact `main` commit is green:

```bash
git switch main
git pull --ff-only
git status --short
node -p "require('./app.json').expo.version"
node -p "require('./app.json').expo.android.versionCode"
git tag -a v1.0.8 -m "HomeLibrary 1.0.8"
git push origin v1.0.8
```

Expected version output:

```text
1.0.8
9
```

Never move, delete/recreate, or reuse a published tag. If correction is needed after tagging, create a new version/versionCode.

The tag push triggers both the existing versioned self-hosting image flow and the Android production release workflow.

## Production APK publication

For a `vX.Y.Z` tag, `.github/workflows/android-release.yml`:

1. checks that the tag exactly matches `app.json`;
2. builds the unsigned APK inside F-Droid's `buildserver-trixie` image using the live source scanner;
3. exports and signs that exact APK outside Gradle with the permanent upstream key;
4. uses Android build-tools 34.0.0 `apksigner` for signature-copy compatibility;
5. verifies the signing certificate against `ANDROID_RELEASE_CERT_SHA256`;
6. publishes `HomeLibrary-X.Y.Z.apk` and checksums to the immutable GitHub Release;
7. reruns F-Droid in release mode with `Binaries` and `AllowedAPKSigningKeys`, and the workflow is not green unless F-Droid's own reference-binary/signature-copy verification succeeds.

Manual workflow runs remain useful for signing tests. If an immutable tag-triggered release fails because of release infrastructure, the corrected workflow may be run manually with `release_tag` set to that existing tag; it checks out and verifies the exact immutable tag source and may publish the permanent assets without moving the tag.

After `v1.0.8` finishes, independently download and verify:

```bash
apksigner verify --verbose --print-certs HomeLibrary-1.0.8.apk
sha256sum HomeLibrary-1.0.8.apk
```

The signer certificate SHA-256 must equal the configured production certificate. Keep that fingerprint: fdroiddata needs its lower-case hex form in `AllowedAPKSigningKeys`.

## Upstream F-Droid recipe

The root `.fdroid.yml` is the upstream development copy. It references the intended immutable tag because a source file cannot contain the SHA of the commit containing itself.

It also defines the reproducible binary location:

```text
Binaries: https://github.com/DitisKees/homelibrary-app/releases/download/v%v/HomeLibrary-%v.apk
```

The submitted fdroiddata metadata must replace `commit: v1.0.8` with the full 40-character SHA resolved from the immutable tag.

The official metadata must retain the already verified `AllowedAPKSigningKeys` value for the permanent production certificate. Do not change the signing identity between releases.

## Test with fdroidserver

The preferred pre-submission test is the GitHub `F-Droid buildserver simulation` workflow. It runs the same public buildserver image used by fdroiddata CI, uses the live F-Droid source scanner, rewrites only the metadata `commit` field to the pull-request/source SHA, and runs:

```text
fdroid fetchsrclibs <appid>:<versionCode> --verbose
fdroid build --verbose --test --refresh-scanner --on-server --no-tarball <appid>:<versionCode>
```

The PR simulation intentionally omits `Binaries`/signing-key comparison so it can run before a release exists, but it now runs twice and byte-compares the two buildserver APKs. After publication, the release workflow runs the same buildserver script in `release` mode with `Binaries` and `AllowedAPKSigningKeys` intact, exercising the same final comparison as fdroiddata. On failure it uploads the build log, effective metadata, generated Android files, and scanner-sensitive React Native Gradle files.

Only after that workflow is green should the fdroiddata branch be updated.

For manual fdroidserver testing, resolve the source commit as before:

Resolve the source commit:

```bash
git rev-list -n 1 v1.0.8
```

In the fdroiddata fork, update `metadata/io.github.ditiskees.homelibrary.yml` to versionName 1.0.8/versionCode 9 and the full SHA, then run:

```bash
fdroid readmeta
fdroid rewritemeta io.github.ditiskees.homelibrary
fdroid checkupdates --allow-dirty io.github.ditiskees.homelibrary
fdroid lint io.github.ditiskees.homelibrary
fdroid build -v -l io.github.ditiskees.homelibrary:9
```

Review `rewritemeta` output rather than blindly committing it.

The open fdroiddata MR uses the reviewer-requested React Native recipe shape with Debian forky Node/npm, Expo prebuild, and direct Gradle assembly. Per maintainer review, `externalNativeBuild` is configured by the checked-in Expo config plugin and APK build-ID normalization is called from the checked-in Python helper; the metadata must not embed either Python implementation.

The F-Droid parent build environment observed during review supplied Node 20.19.2, while the current React Native/Expo toolchain requires a newer supported Node baseline. The fdroiddata recipe should keep the reviewer-approved Debian packaging approach where possible, but the final build-tool solution must satisfy the actual React Native/Expo engine requirement and should be discussed transparently in the MR rather than hidden with disabled checks.

## What to verify in the F-Droid build

Confirm that:

- package is `io.github.ditiskees.homelibrary`;
- versionName is 1.0.8 and versionCode is 9;
- target SDK remains 36;
- no Google Play Services, Firebase, ML Kit, or Play SDK dependency appears;
- `expo.camera.barcode-scanner-enabled=false` remains an exact generated Gradle property after release-only settings are appended;
- the final APK contains no Barhopper native library, ML Kit barcode models, or Google barcode-scanner metadata;
- bundled Expo `local-maven-repo` directories are absent before Android generation;
- Expo native modules compile from source;
- the F-Droid scanner has no unexplained proprietary/binary finding;
- F-Droid's rebuilt unsigned APK reproduces the upstream-signed APK sufficiently for signature copying/verification;
- installation, authentication, library loading, ISBN scanning/manual entry, cover handling, reading status, and lending basics work.

## Update existing fdroiddata MR !48673

Do not open a second app-submission MR. Update the existing `fdroid/fdroiddata!48673` branch after `v1.0.8` and its GitHub Release APK exist:

1. set `CurrentVersion: 1.0.8` and `CurrentVersionCode: 9`;
2. add/update the build entry for versionCode 9 with the full `v1.0.8` commit SHA;
3. use the shared canonical build path;
4. add `Binaries: https://github.com/DitisKees/homelibrary-app/releases/download/v%v/HomeLibrary-%v.apk`;
5. add the independently verified lower-case certificate fingerprint as `AllowedAPKSigningKeys`;
6. retain `AuthorName`;
7. require the GitHub `F-Droid buildserver simulation` workflow to be green, then run `rewritemeta`, `lint`, `checkupdates`, and the versionCode 9 build;
8. update the MR description to state that upstream reproducible signing is complete;
9. ask for the parent pipeline/buildserver to be rerun.

## After acceptance

For each later release, repeat the version bump/changelog/green-CI/tag/signed-GitHub-Release sequence and monitor the first F-Droid build after native dependency or Expo SDK changes.
