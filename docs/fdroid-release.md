# F-Droid release procedure

This document describes the release path for HomeLibrary's first upstream-signed reproducible F-Droid publication. The current candidate is Android `1.0.3` / versionCode `4`, with intended immutable tag `v1.0.3`.

The earlier `v1.0.2` / versionCode 3 candidate must remain untouched. Reproducibility and permanent signing were completed after that source point.

## Version source of truth

Android release versions are defined in `app.json`:

```json
{
  "expo": {
    "version": "1.0.3",
    "android": {
      "versionCode": 4
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

The pinned repository `expo-doctor` version must be used; do not use `@latest` in release validation. GitHub CI and the two-clean-checkout reproducibility workflow must be green before tagging.

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
git tag -a v1.0.3 -m "HomeLibrary 1.0.3"
git push origin v1.0.3
```

Expected version output:

```text
1.0.3
4
```

Never move, delete/recreate, or reuse a published tag. If correction is needed after tagging, create a new version/versionCode.

The tag push triggers both the existing versioned self-hosting image flow and the Android production release workflow.

## Production APK publication

For a `vX.Y.Z` tag, `.github/workflows/android-release.yml`:

1. checks that the tag exactly matches `app.json`;
2. builds the canonical reproducible unsigned APK;
3. signs it outside Gradle with the permanent upstream key;
4. uses Android build-tools 34.0.0 `apksigner` for F-Droid signature-copy compatibility;
5. verifies the signing certificate against `ANDROID_RELEASE_CERT_SHA256`;
6. publishes `HomeLibrary-X.Y.Z.apk`, its SHA-256 file, and `apksigner.txt` to the GitHub Release for that immutable tag.

Manual workflow runs remain useful for signing tests but only tag runs create permanent release assets.

After `v1.0.3` finishes, independently download and verify:

```bash
apksigner verify --verbose --print-certs HomeLibrary-1.0.3.apk
sha256sum HomeLibrary-1.0.3.apk
```

The signer certificate SHA-256 must equal the configured production certificate. Keep that fingerprint: fdroiddata needs its lower-case hex form in `AllowedAPKSigningKeys`.

## Upstream F-Droid recipe

The root `.fdroid.yml` is the upstream development copy. It references the intended immutable tag because a source file cannot contain the SHA of the commit containing itself.

It also defines the reproducible binary location:

```text
Binaries: https://github.com/DitisKees/homelibrary-app/releases/download/v%v/HomeLibrary-%v.apk
```

The submitted fdroiddata metadata must replace `commit: v1.0.3` with the full 40-character SHA resolved from the immutable tag.

The official metadata must additionally contain:

```text
AllowedAPKSigningKeys: <lower-case production certificate SHA-256>
```

Do not add or guess this value before independently verifying the first production APK.

## Test with fdroidserver

Resolve the source commit:

```bash
git rev-list -n 1 v1.0.3
```

In the fdroiddata fork, update `metadata/io.github.ditiskees.homelibrary.yml` to versionName 1.0.3/versionCode 4 and the full SHA, then run:

```bash
fdroid readmeta
fdroid rewritemeta io.github.ditiskees.homelibrary
fdroid checkupdates --allow-dirty io.github.ditiskees.homelibrary
fdroid lint io.github.ditiskees.homelibrary
fdroid build -v -l io.github.ditiskees.homelibrary:4
```

Review `rewritemeta` output rather than blindly committing it.

The current fdroiddata MR previously failed at the HomeLibrary build command because the old recipe invoked `scripts/check-fdroid-android-dependencies.sh` from the repository root, where `./gradlew` did not exist. The current upstream recipe delegates to `scripts/build-fdroid-android.sh`; that script performs Expo prebuild and runs Gradle from `android/`, eliminating that path mismatch.

The F-Droid parent build environment observed during review supplied Node 20.19.2, while the current React Native/Expo toolchain requires a newer supported Node baseline. The fdroiddata recipe should keep the reviewer-approved Debian packaging approach where possible, but the final build-tool solution must satisfy the actual React Native/Expo engine requirement and should be discussed transparently in the MR rather than hidden with disabled checks.

## What to verify in the F-Droid build

Confirm that:

- package is `io.github.ditiskees.homelibrary`;
- versionName is 1.0.3 and versionCode is 4;
- target SDK remains 36;
- no Google Play Services, Firebase, ML Kit, or Play SDK dependency appears;
- bundled Expo `local-maven-repo` directories are absent before Android generation;
- Expo native modules compile from source;
- the F-Droid scanner has no unexplained proprietary/binary finding;
- F-Droid's rebuilt unsigned APK reproduces the upstream-signed APK sufficiently for signature copying/verification;
- installation, authentication, library loading, ISBN scanning/manual entry, cover handling, reading status, and lending basics work.

## Update existing fdroiddata MR !48673

Do not open a second app-submission MR. Update the existing `fdroid/fdroiddata!48673` branch after `v1.0.3` and its GitHub Release APK exist:

1. set `CurrentVersion: 1.0.3` and `CurrentVersionCode: 4`;
2. add/update the build entry for versionCode 4 with the full `v1.0.3` commit SHA;
3. use the shared canonical build path;
4. add `Binaries: https://github.com/DitisKees/homelibrary-app/releases/download/v%v/HomeLibrary-%v.apk`;
5. add the independently verified lower-case certificate fingerprint as `AllowedAPKSigningKeys`;
6. retain `AuthorName`;
7. run `rewritemeta`, `lint`, `checkupdates`, and the versionCode 4 build;
8. update the MR description to state that upstream reproducible signing is complete;
9. ask for the parent pipeline/buildserver to be rerun.

## After acceptance

For each later release, repeat the version bump/changelog/green-CI/tag/signed-GitHub-Release sequence and monitor the first F-Droid build after native dependency or Expo SDK changes.
