# Permanent Android release signing

HomeLibrary deliberately separates the reproducible **unsigned** Android source build from upstream signing. `scripts/build-fdroid-android.sh` remains the canonical public build; production credentials are never injected into Gradle, Expo prebuild, npm, or the F-Droid source-build path.

## One-time signing-key creation

Create the permanent key on a trusted local machine. Never generate it in GitHub Actions and never commit the keystore or passwords.

```bash
umask 077
mkdir -p "$HOME/homelibrary-release-key"
cd "$HOME/homelibrary-release-key"

keytool -genkeypair \
  -keystore homelibrary-release.jks \
  -alias homelibrary \
  -keyalg RSA \
  -keysize 4096 \
  -sigalg SHA256withRSA \
  -validity 10000
```

Keep the keystore and credentials in at least two secure backups. Losing this key prevents future upstream APKs from using the same signing identity.

Record the certificate SHA-256 fingerprint:

```bash
keytool -list -v \
  -keystore homelibrary-release.jks \
  -alias homelibrary \
  | grep 'SHA256:'
```

Create a single-line base64 representation for GitHub:

```bash
base64 -w 0 homelibrary-release.jks
printf '\n'
```

On macOS/BSD:

```bash
base64 < homelibrary-release.jks | tr -d '\n'
```

## GitHub configuration

Repository Actions secrets:

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_KEYSTORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`

Repository Actions variable:

- `ANDROID_RELEASE_CERT_SHA256`

The certificate fingerprint is public information and is intentionally a variable rather than a secret.

## Production workflow

`.github/workflows/android-release.yml` supports two modes:

- **manual workflow_dispatch**: build/sign/verify and retain a 30-day Actions artifact for testing; optionally provide an existing immutable `release_tag` to recover a failed release publication while checking out that exact tag;
- **immutable semantic-version tag**: perform the same build/sign/verify path and additionally attach permanent assets to that tag's GitHub Release.

The workflow:

1. validates that a tag such as `v1.0.3` exactly matches the version in `app.json`;
2. restores the production keystore only in the runner temporary directory;
3. verifies its certificate against `ANDROID_RELEASE_CERT_SHA256`;
4. runs the canonical reproducible unsigned build;
5. locates `sdkmanager` under the configured Android SDK (rather than assuming it is on `PATH`), installs build-tools 34.0.0, and uses that `apksigner`;
6. signs outside Gradle;
7. verifies the signed APK and certificate again;
8. produces `HomeLibrary-<version>.apk`, its SHA-256 file, and `apksigner.txt`;
9. on tag runs, publishes those files to the immutable GitHub Release.

Build-tools 34.0.0 is intentionally used for signing because F-Droid's reproducible-build tooling supports signature copying from that `apksigner` format reliably.

## First reproducible production release

After the 1.0.3 preparation PR is merged and all required checks are green, create and push the immutable `v1.0.3` tag. Do not run the permanent release from an unverified or moving branch reference.

When the tag workflow finishes, download the permanent release asset and independently verify:

```bash
apksigner verify --verbose --print-certs HomeLibrary-1.0.3.apk
sha256sum HomeLibrary-1.0.3.apk
```

The signer certificate SHA-256 must equal `ANDROID_RELEASE_CERT_SHA256`.

The release APK URL is intentionally predictable:

```text
https://github.com/DitisKees/homelibrary-app/releases/download/v1.0.3/HomeLibrary-1.0.3.apk
```

This makes it suitable for F-Droid's `Binaries` reproducible-build verification.

## F-Droid AllowedAPKSigningKeys

Only after independently verifying the first permanent production APK should the same certificate SHA-256 be added to fdroiddata as `AllowedAPKSigningKeys`, in lower-case hex form.

Never use the release-smoke/test certificate; it is intentionally a different disposable CI identity.

The production keystore must never be committed, attached to an issue/PR, uploaded as a release asset, or otherwise leave secret storage.

## Recovering a failed tag-triggered release

If release automation fails after an immutable tag has already been pushed, never move or recreate the tag. Fix the workflow on `main`, then manually run **Android release** from the corrected `main` workflow and set `release_tag` to the existing tag (for example `v1.0.3`). The workflow checks out that exact tag, verifies that its version matches `app.json`, confirms the checked-out commit equals the tag target, and publishes assets to that tag's GitHub Release.
