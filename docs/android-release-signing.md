# Permanent Android release signing

HomeLibrary's F-Droid/upstream release process deliberately separates the reproducible **unsigned** build from upstream signing. `scripts/build-fdroid-android.sh` remains the canonical source build. The production workflow signs that exact unsigned APK afterwards; production credentials are never injected into Gradle, Expo prebuild, npm, or the F-Droid source-build path.

## One-time signing-key creation

Create the permanent key on a trusted local machine. Do not generate it in GitHub Actions and do not commit the keystore or passwords.

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

Use strong unique passwords and store the keystore plus credentials in at least two secure backups. Losing this key prevents future upstream APKs from being signed with the same identity.

Record the certificate SHA-256 fingerprint:

```bash
keytool -list -v \
  -keystore homelibrary-release.jks \
  -alias homelibrary \
  | grep 'SHA256:'
```

Create a single-line base64 representation for the GitHub secret:

```bash
base64 -w 0 homelibrary-release.jks
printf '\n'
```

On macOS/BSD, use `base64 < homelibrary-release.jks | tr -d '\n'` instead.

## GitHub configuration

In repository **Settings → Secrets and variables → Actions**, create these repository secrets:

- `ANDROID_RELEASE_KEYSTORE_BASE64`: single-line base64 content of `homelibrary-release.jks`.
- `ANDROID_RELEASE_KEYSTORE_PASSWORD`: keystore password.
- `ANDROID_RELEASE_KEY_ALIAS`: `homelibrary` (or the alias chosen during creation).
- `ANDROID_RELEASE_KEY_PASSWORD`: private-key password.

Create this repository **variable** (not a secret):

- `ANDROID_RELEASE_CERT_SHA256`: SHA-256 certificate fingerprint printed by `keytool`. Colons are optional.

The fingerprint is intentionally non-secret: F-Droid ultimately needs the public signing-certificate identity too.

## Production workflow

`.github/workflows/android-release.yml` is manual-only. It:

1. refuses to proceed unless all four signing secrets and the pinned certificate fingerprint exist;
2. restores the keystore only under the runner temporary directory with restrictive permissions;
3. verifies the keystore certificate against `ANDROID_RELEASE_CERT_SHA256` before building;
4. runs `scripts/build-fdroid-android.sh`, producing the canonical reproducible unsigned APK;
5. signs that APK with Android SDK `apksigner` outside Gradle;
6. verifies the signed APK and checks its certificate fingerprint again;
7. uploads the signed APK, its SHA-256 checksum, and `apksigner` verification output as workflow artifacts.

This design keeps the existing F-Droid reproducibility boundary intact: signing does not alter the source build and the unsigned APK remains independently reproducible.

## First production run

After the workflow change is merged and the repository secrets/variable are configured, run **Android release** manually from GitHub Actions. Download the artifact and independently verify it locally:

```bash
apksigner verify --verbose --print-certs HomeLibrary-release.apk
sha256sum HomeLibrary-release.apk
```

The signer certificate SHA-256 must equal `ANDROID_RELEASE_CERT_SHA256`.

Do not publish the first production APK until that independent check succeeds.

## F-Droid AllowedAPKSigningKeys

Only after the first production APK has been signed and independently verified should the same certificate SHA-256 be added to the F-Droid metadata as `AllowedAPKSigningKeys`. Do not use the existing release-smoke/test certificate; it is intentionally a different, disposable CI identity.

The production keystore must never be committed to this repository, attached to a GitHub issue/PR, or included in release artifacts.
