# Android release smoke builds

HomeLibrary has a manual GitHub Actions workflow, **Android release smoke**, for producing an installable release-mode APK from a trusted repository ref.

This workflow is intended for device verification of security-sensitive native changes. It is separate from official F-Droid release signing and must never be treated as the production/F-Droid signing identity.

## Test signing identity

The workflow uses a persistent **test-only** Android signing key stored in GitHub Actions repository secrets. Keeping the same test key allows a later smoke APK to be installed as an update over an earlier smoke APK, which is useful for testing session/storage migration behavior.

Required repository secrets:

- `ANDROID_TEST_KEYSTORE_BASE64` — base64-encoded test keystore file;
- `ANDROID_TEST_KEYSTORE_PASSWORD` — keystore password;
- `ANDROID_TEST_KEY_ALIAS` — signing-key alias;
- `ANDROID_TEST_KEY_PASSWORD` — key password.

The expected test certificate SHA-256 fingerprint is:

```text
0A:E7:21:EA:71:E0:24:65:A2:61:E5:61:25:F2:19:E6:9D:8C:92:1E:CA:91:F3:0C:9D:5C:FE:E8:9D:3B:46:61
```

The workflow checks this fingerprint before the APK is built. If the test key is deliberately rotated, update the pinned fingerprint in `.github/workflows/android-release-smoke.yml` in the same reviewed change.

Do not commit the keystore, passwords, or base64 keystore value to Git.

## Running the workflow

1. Open the repository's **Actions** tab.
2. Select **Android release smoke**.
3. Select **Run workflow**.
4. Choose the trusted branch/ref to test, normally `main` after the relevant PR has merged.
5. Start the workflow.
6. When it succeeds, download the `homelibrary-release-smoke-...` artifact.
7. Extract `app-release.apk` and install it on the Android test device.

The artifact is retained for 14 days and also contains `app-release.apk.sha256`.

Because repository signing secrets are exposed to this manual job, only run the workflow against code you trust. Ordinary pull-request CI does not receive or use the test signing secrets.

## What the workflow verifies

Before uploading the APK, the workflow:

- installs the exact npm lockfile dependencies;
- runs the Android release configuration validator;
- generates the native Android project with Expo prebuild;
- checks the generated Android dependency graph for the existing F-Droid non-free dependency guard;
- injects the test signing configuration only into the generated CI Android project;
- builds `:app:assembleRelease`, so React Native runs with release semantics (`__DEV__` is false);
- verifies the APK signature with Android `apksigner`;
- publishes a SHA-256 checksum alongside the APK.

No signing key material is written to the repository or uploaded with the APK artifact.

## Issue #4 device smoke test

For the production-security verification, test at least:

1. clean-install the release-smoke APK;
2. confirm a remote plain-HTTP endpoint such as `http://example.com` is rejected before credentials can be submitted;
3. confirm the intended `https://` PocketBase server can be configured;
4. sign in successfully;
5. force-stop HomeLibrary and reopen it — the login should persist through native SecureStore;
6. log out and reopen the app — the session must remain cleared;
7. sign in again, change the PocketBase endpoint, and confirm the old session/cache is cleared;
8. verify ISBN barcode scanning and cover capture still work in the release build.

### Upgrade/re-login behavior

The security-hardening change intentionally discards the legacy native `pb_auth` AsyncStorage entry instead of migrating that credential into SecureStore. To test this migration behavior accurately, install a pre-hardening APK signed with the **same test key**, sign in, and then install the new release-smoke APK over it. The first upgraded launch should require one new login; later launches should persist that new session in SecureStore.

## Key rotation

This test key is disposable and is not an application-production identity. If it is exposed or needs to be replaced:

1. generate a new test keystore;
2. replace all four GitHub Actions secrets;
3. update the pinned certificate fingerprint in the workflow;
4. uninstall APKs signed with the old test key before installing APKs signed with the replacement.
