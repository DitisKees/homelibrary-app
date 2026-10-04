# F-Droid APK scanning

Reproducibility and binary eligibility are separate release gates. A signed APK
can reproduce exactly and still fail F-Droid's binary scanner. HomeLibrary now
runs the binary scanner on CI release APKs, both production buildserver outputs,
the signed APK before publication, and the downloaded signed reference during
release verification. Any finding or scanner execution failure blocks the gate.
The scanner refreshes its signature data on every invocation.

`scripts/scan-fdroid-apk.sh` uses the scanner revision in
`scripts/fdroid/pins.env`. The initial revision matches fdroiddata's check-apk
job for HomeLibrary 1.0.9. Update that pin deliberately when the parent scanner
changes; keep the production buildserver pin separate. Scanner logs from the
production harness are included in its existing diagnostic artifact.

On Ubuntu/Debian, install `fdroidserver` to provide the Python dependencies.
Point `ANDROID_HOME` at an SDK with build-tools and run:

```sh
bash scripts/scan-fdroid-apk.sh path/to/app.apk
```

An isolated Python environment can be selected with
`FDROID_APK_SCANNER_PYTHON`; the default is `/usr/bin/python3`, matching Debian
packages. The clean scanner checkout must match the pinned revision.

## Expo Camera's disabled barcode source

HomeLibrary's Android ISBN scanner captures photos through Expo Camera and
decodes them using its local Apache-2.0 ZXing module. Expo Camera 57.0.5's
`barcodeScannerEnabled=false` changes Google's dependencies to `compileOnly`,
but retains Kotlin code that references Google Tasks and ML Kit classes. The
1.0.9 APK contained no implementations of those classes, yet fdroiddata's
scanner reported nine names from the remaining references.

The reviewed patch in `patches/` removes the Google barcode implementations,
imports, dependency declarations, and manifest metadata. The disabled barcode
APIs reject explicitly and capability checks return false. Camera preview,
photo capture, permissions, and HomeLibrary's ZXing path are retained. This
patch affects Android only.

`npm ci` applies the patch through postinstall, including F-Droid's recipe.
The patcher requires the exact Expo Camera version, disabled barcode config,
and checksums of every affected source file. It checks the full baseline before
applying a unified patch, verifies all resulting checksums, and accepts an
already patched tree. A changed dependency, source drift, or mixed state fails
before compilation rather than applying approximate string replacements.

When upgrading Expo Camera, review its complete native source and the app's
camera API usage, regenerate the patch and checksums from the new locked npm
package, run the patch tests and native compilation, then scan the actual APK.
Do not suppress scanner findings or rely only on dependency/artifact-name
checks. Removing these references changes DEX bytes and requires a new release;
the existing 1.0.9 tag and published APK must remain immutable.

## Integration requirements

The web Docker builder runs the same npm postinstall. Its dependency-install
layer must include app.json, the reviewed patch/checksum files, the patcher,
and Git before npm ci. Copying the application only after dependency
installation omits required inputs.

Installing Debian forky's fdroidserver can also install a newer default JDK.
The legacy Android reproducibility job therefore selects Java 21 explicitly
through JAVA_HOME; package-manager alternatives must not choose Gradle's JVM.

The app's Expo Gradle plugin disables AGP dependenciesInfo inclusion in APKs
and bundles using includeInApk=false and includeInBundle=false. This prevents
the dependency-metadata signing block rejected by F-Droid's scanner. Keep
the scanner strict and configure generation rather than altering signed APKs.
