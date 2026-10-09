# F-Droid release process

The next candidate is **1.0.11**, base Android code **12**. Published releases,
including 1.0.10, and their tags/assets remain immutable. The 2026-10-05
maintainer review of `fdroid/fdroiddata!48673` requests R8 and ABI-specific APKs.

## Version and APK identity

`app.json` stores the semantic version and the **base** Android code.
`scripts/android-release-abis.json` defines the ABI suffixes. The Expo plugin
`plugins/with-android-release-packaging.js` generates release configuration
upstream; fdroiddata does not patch the generated Gradle version or optimizer.

| ABI | Code (`10 * base + suffix`) | Asset for 1.0.11 |
| --- | --- | --- |
| armeabi-v7a | 121 | HomeLibrary-1.0.11-armeabi-v7a.apk |
| arm64-v8a | 122 | HomeLibrary-1.0.11-arm64-v8a.apk |
| x86 | 123 | HomeLibrary-1.0.11-x86.apk |
| x86_64 | 124 | HomeLibrary-1.0.11-x86_64.apk |

Each is a standalone installable APK, built with React Native's supported
`-PreactNativeArchitectures=<abi>` property. These are not APK-set fragments.
An ordinary all-ABI developer/smoke build retains a universal APK, code 120.
The production workflow publishes the four smaller ABI APKs.

For each new release:

1. Increment the semantic version and **base** code in `app.json`.
2. Update all four `.fdroid.yml` builds and their tag, plus `CurrentVersion`.
3. Set `CurrentVersionCode` to `10 * base + 4`.
4. Add changelogs for all four actual APK codes in every Fastlane locale; also
   add code `10 * base` for the universal smoke APK.
5. Keep the four `VercodeOperation` expressions and per-build binary URLs.

ABI digits are in the lowest position, so every APK in the next release has a
higher code than every APK in the previous release. F-Droid copies all four
build entries during automatic updates. Each entry's `binary` URL includes its
literal ABI and `%v` for the version. An app-wide universal `Binaries` URL would
compare each rebuild with the wrong signed APK.

## R8 and dependency rules

The plugin enables release minification and replaces Expo's non-optimized
default ProGuard file with `proguard-android-optimize.txt`, retaining the generated
app rules and dependency consumer rules. React Native supplies JNI/bridge rules;
Expo Modules Core supplies module/record/view rules; Expo Image supplies Glide
and WebP rules. The local ZXing module extends Expo's Module and uses ZXing
classes directly, so it does not require a blanket keep rule.

Do not disable R8 or add global `-dontwarn`, `-dontoptimize`, or keep-all rules to
hide a failure. Inspect missing-class reports and runtime behavior first.
Resource shrinking is disabled: F-Droid documents potential non-determinism and
recommends enabling it only when its reduction is substantial and verified.
The existing Expo AGP 8.10.1 toolchain includes a newer R8 than the versions recommended
for older CPU-dependent reproducibility bugs; no toolchain upgrade is needed.

## Before tagging

Run `npm ci`, the release/metadata validators, native config regression checks,
`npm run typecheck`, `npm run lint`, `npm test`, and `npm run build:web`.

Normal CI and the F-Droid buildserver reproducibility checks for all four ABIs must pass. F-Droid buildserver
simulation independently builds **every ABI twice**, scans each APK, verifies
its package/version/native ABI and bundled JavaScript, and byte-compares matching
ABIs. A nonempty R8 `mapping.txt` is required and exported with each APK. The
x86_64 comparison job also signs an ephemeral copy, installs it in an Android
emulator, and requires the initial React Native screen to render without a fatal
exception. This uses no production key.

Emulator startup does not replace device testing. Before release, verify on ARM
hardware: installation/update, login, session persistence and logout, library
thumbnails, ISBN scanning, cover capture, and navigation. Record actual sizes
for all four APKs compared with the preceding universal release. Do not claim
these checks or size reductions passed before evidence exists.

Once the PR is merged and main is green, create the **new** immutable tag:

```bash
git switch main
git pull --ff-only
git tag v1.0.11
git push origin v1.0.11
```

Never move/recreate an existing tag or replace an existing APK with different
bytes. Use the manual `release_tag` recovery input only for an existing immutable
release whose source/version still agrees with canonical metadata.

## Publication and signed-reference verification

The Android release workflow:

1. Builds each ABI from the immutable source using the pinned F-Droid production
   buildserver path and source scanner.
2. Exports the exact unsigned APK and its R8 mapping.
3. Signs all four artifacts with the permanent production key and apksigner
   **34.0.0**, preserving F-Droid signature-copy compatibility.
4. Verifies the certificate, scans each signed APK and publishes the four APKs,
   checksums, certificate reports and mapping files as immutable release assets.
5. Rebuilds each ABI with canonical `.fdroid.yml` unchanged and requires
   F-Droid's signed-reference/signature-copy comparison to pass for **each**.

Keep `AllowedAPKSigningKeys` unchanged. Each source test removes both app-wide
and per-build reference binary fields structurally; released verification retains
them. Do not turn a source test into release-parity evidence.

## Update the existing fdroiddata MR

Only after source CI, device testing, immutable publication and all four signed
reference checks are green, update the existing
[fdroid/fdroiddata!48673](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/48673).
Do not create another app submission or spend GitLab CI minutes testing an
unpublished reference binary.

Copy canonical `.fdroid.yml` to `metadata/io.github.ditiskees.homelibrary.yml` in
the fdroiddata fork, resolving all four `commit` entries to the full new tag SHA.
Retain the four `binary` URLs, `VercodeOperation`, production signer and reviewed
scanner exceptions. Run `fdroid rewritemeta`, `fdroid lint`, `fdroid checkupdates`
and each of the four build specifications (121, 122, 123, 124).

Report the exact immutable source, per-ABI codes, sizes, SHA-256 values, signer
and verification runs. The remote F-Droid runner remains the final parity check;
a GitHub build in the same container alone does not establish remote parity.

## Documentation reviewed

- [Submitting to F-Droid: ABI split](https://f-droid.org/en/docs/Submitting_to_F-Droid_Quick_Start_Guide/#setup-abi-split)
- [Build metadata: VercodeOperation](https://f-droid.org/en/docs/Build_Metadata_Reference/#vercodeoperation)
- [Reproducible builds: R8, resource shrinking and signatures](https://f-droid.org/en/docs/Reproducible_Builds/)
- [Inclusion policy](https://f-droid.org/en/docs/Inclusion_Policy/)
- [Anti-Features: non-free network services](https://f-droid.org/en/docs/Anti-Features/#non-free-network-services)
- [React Native: other stores and ProGuard](https://reactnative.dev/docs/signed-apk-android)

The existing build-from-source policy, Debian Node/npm, NDK pin, Glide KSP
ordering fix, localhost dev-server resource, scanner gates and permanent signing
identity remain part of every architecture's recipe. See `fdroid-harness.md` for
pinning, diagnostics and the previous reproducibility investigation.

The policy review also found an existing metadata omission: ISBN lookup always
includes Google Books, even without an API key (Open Library is tried first).
With a user-provided API key, Google Books is tried first. The canonical recipe
now declares `NonFreeNet` with that precise explanation. Manual entry and the
self-hosted PocketBase library remain usable without Google Books. No built-in
API key or service dependency is added by this change.
