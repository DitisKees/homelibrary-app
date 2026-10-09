# F-Droid harness architecture

This document is the maintenance contract for HomeLibrary's F-Droid build and release verification tooling.

The central rule is simple:

> **F-Droid itself is the build authority; our harness should only pin, prepare, invoke, and verify it.**

The harness must stay boring. If a future change makes it clever, stateful, or dependent on textual YAML manipulation, stop and redesign it before extending it.

## Why this exists

During the initial F-Droid submission, several upstream failures were not HomeLibrary application failures. They were failures in our attempt to imitate F-Droid:

- Git safe-directory behavior differed inside the buildserver container;
- GitHub pull requests checked out a synthetic merge commit while F-Droid was asked to build the PR head;
- source-test metadata was produced by regex/string edits;
- a single trailing space in `Binaries: ` changed fdroidserver canonical formatting;
- metadata stripping removed or retained blank lines differently from `fdroid rewritemeta`;
- the source simulation omitted the final `Binaries`/signature-copy comparison;
- moving F-Droid/toolchain inputs made otherwise identical runs capable of changing underneath us.

Each individual fix was reasonable, but together they made the harness fragile. The architecture below is intended to prevent a return to that pattern.

## Sources of truth

There are deliberately few sources of truth.

### 1. Canonical release metadata

`.fdroid.yml` is the single canonical HomeLibrary F-Droid recipe.

It contains the real release fields, including:

- `Binaries`;
- `AllowedAPKSigningKeys`;
- versionName/versionCode;
- build commands;
- scanner exceptions;
- immutable release tag.

Do not maintain a second handwritten source-test metadata file.

### 2. Pinned F-Droid toolchain

`scripts/fdroid/pins.env` pins:

- the buildserver image by immutable OCI digest;
- the exact fdroidserver commit;
- the exact fdroiddata commit used as the harness baseline;
- the bootstrap Android build-tools version.

Build jobs must not replace these pins with moving branches/tags during execution.

### 3. Application release version

`app.json` remains the source of truth for Android versionName and versionCode.

## Two explicit flows

The harness intentionally has two entry points. Do not merge them back into a mode-switching script.

### Source-candidate build

Entry point:

```bash
FDROID_ABI=arm64-v8a scripts/fdroid/run-source-build.sh <40-character-source-sha> .fdroid.yml
```

Purpose:

- test an unreleased pull-request/main commit;
- run F-Droid's scanner and production buildserver path;
- export the unsigned APK;
- support two independent byte-for-byte builds.

Because an unreleased commit has no immutable signed binary yet, this flow must derive temporary source-test metadata.

That derivation is structural:

1. fdroidserver parses canonical `.fdroid.yml`;
2. `Binaries` is removed from the in-memory metadata object;
3. `AllowedAPKSigningKeys` is removed from the in-memory object;
4. the selected build's `commit` is replaced with the exact requested SHA;
5. fdroidserver writes the generated metadata in its own canonical format.

Implementation:

`scripts/fdroid/derive-source-metadata.py`

It must never edit YAML with regexes, sed, line numbers, whitespace assumptions, or string replacement.

A fast structural test runs before Android work:

`scripts/fdroid/test-derive-source-metadata.py`

### Released-version verification

Entry point:

```bash
FDROID_ABI=arm64-v8a scripts/fdroid/run-release-verification.sh .fdroid.yml
```

Purpose:

- verify a published immutable release;
- use canonical release metadata byte-for-byte;
- retain `Binaries` and `AllowedAPKSigningKeys`;
- run F-Droid's signed-reference/signature-copy verification.

This flow must not derive or modify metadata.

If release verification requires a metadata change, that change belongs in canonical `.fdroid.yml` and must pass `fdroid rewritemeta` before merge.

## Shared layer

`scripts/fdroid/lib-buildserver.sh` contains only shared mechanics:

- exact pinned repository checkouts;
- Android SDK bootstrap required by fdroiddata CI;
- F-Droid command execution as the buildserver `vagrant` user;
- canonical metadata assertion;
- lint/checkupdates/build invocation;
- diagnostics;
- unsigned APK export.

It must not decide whether a run is source or release verification.

## Reproducibility and pinning rules

### Buildserver image

GitHub workflows use the image from `pins.env` by digest, not only by tag.

GitHub Actions requires the container image before checkout, so the image string is duplicated in workflow YAML. `scripts/validate-fdroid-metadata.mjs` verifies that the workflow uses the expected digest.

### fdroidserver and fdroiddata

The harness checks out exact commits.

Never do this in a build:

```text
git pull
git checkout master
git checkout main
```

A F-Droid toolchain update is a separate maintenance change, not an incidental side effect of an application build.

### Buildserver OS packages

Do not run `apt dist-upgrade` in the harness.

The pinned image is part of the reproducible environment. Application metadata may still install packages required by the actual F-Droid recipe, because that behavior is part of the recipe F-Droid will execute remotely.

### gradlew-fdroid

`/home/vagrant/gradlew-fdroid` comes from the pinned buildserver image.

Do not `git pull` it. Updating it requires updating the image digest in a dedicated toolchain maintenance PR.

## Canonical metadata rule

Both generated source metadata and canonical release metadata are passed through the pinned fdroidserver's `rewritemeta` check.

The check is an assertion, not a repair step.

If `rewritemeta` changes a file:

1. do not add another whitespace workaround to the harness;
2. determine whether the canonical release metadata or the structural derivation is wrong;
3. fix the source of truth/generator;
4. rerun the fast harness test and complete buildserver checks.

## Workflow gates

The shared [CI routing policy](ci-workflows.md) determines when source changes require this gate. Documentation and isolated diagnostics skip native compilation; manual dispatch always runs it.

### Pull request / main source gate

`.github/workflows/fdroid-buildserver-simulation.yml`:

1. checks out the exact PR head or main SHA;
2. verifies Git access inside the pinned container;
3. runs two independent source-build jobs for each of the four ABIs;
4. exports both unsigned APKs;
5. requires byte-for-byte equality for each ABI;
6. signs an ephemeral x86_64 APK and verifies startup on an Android emulator.

This workflow owns automatic native compilation, dependency checks, APK verification and scanning. Normal CI runs the fast source checks and web export. `android-reproducibility.yml` remains a manual alternate-toolchain/two-checkout diagnostic; it does not repeat native builds on every pull request.

This gate proves that the source candidate is buildable through the pinned F-Droid container/tooling path and deterministic on the GitHub-hosted runner. It does **not** prove parity with F-Droid's GitLab SaaS runner. During the 2026 reproducibility investigation, the same container digest, fdroidserver revision, recipe, JDK, locale, and Gradle command produced different APK bytes on GitHub and GitLab runners.

### Release gate

`.github/workflows/android-release.yml`:

1. verifies the immutable release tag;
2. runs the source-build runner on the tagged source;
3. signs that exact exported unsigned APK;
4. publishes immutable GitHub Release assets;
5. runs the released-version verification runner with canonical metadata;
6. requires F-Droid's own signed-reference verification to succeed.

A release is not ready for fdroiddata merely because signing/publication succeeded. The final F-Droid parity job must be green.

## Recovery runs

A failed release must never cause an immutable tag or release asset to be moved/replaced.

If release infrastructure is fixed after a tag exists:

- run the corrected workflow from current `main`;
- pass the existing immutable tag via `release_tag`;
- verify that the tagged source is unchanged;
- keep already-published assets only if they are byte-for-byte identical;
- use current harness tooling with canonical metadata that still points F-Droid at the immutable release tag.

## fdroiddata update rule

Do not update `fdroid/fdroiddata!48673` until all of the following are green:

- normal CI;
- two-copy F-Droid source buildserver simulation, including reproducibility for all ABIs;
- immutable GitHub release publication;
- F-Droid signed-reference release verification.

The fdroiddata parent pipeline should be confirmation, not the first place a failure class is discovered.

## Toolchain updates

The pins are intentionally not automatically refreshed.

When F-Droid changes its production environment, create a dedicated maintenance PR that:

1. updates the image digest and/or fdroidserver/fdroiddata pins;
2. explains why each pin changes;
3. runs the fast metadata derivation test;
4. runs both independent source builds;
5. byte-compares their APKs;
6. runs the manual alternate-toolchain Android reproducibility diagnostic;
7. if a published release is available, runs released-version verification;
8. only then merges the updated pins.

Do not combine a F-Droid toolchain upgrade with unrelated application functionality unless unavoidable.

## Anti-patterns: do not repeat these

Do not:

- edit F-Droid YAML with regexes, sed, substring replacement, or line-oriented scripts;
- maintain independent handwritten source and release recipes;
- add a new `source`/`release` mode to one large script;
- run `git pull` during CI to "match latest F-Droid";
- run `apt dist-upgrade` inside a pinned buildserver image;
- use only a moving container tag when a digest is available;
- treat `fdroid rewritemeta` as a formatter that silently repairs CI inputs;
- update fdroiddata before the signed-reference release gate passes;
- move/recreate a published release tag;
- overwrite an existing release APK with different bytes;
- solve a harness-design problem by accumulating another special-case regex.

## How to diagnose future failures

Classify the failure before changing code.

### Application/recipe failure

Examples:

- Gradle compile failure;
- scanner rejects a dependency;
- missing Android source;
- dependency audit fails.

Fix the application or canonical recipe.

### Harness failure

Examples:

- source metadata derivation differs from canonical fdroidserver output;
- pinned checkout/environment setup fails;
- workflow builds a different SHA than requested.

Fix the harness architecture/tests. Do not modify application code to satisfy a harness bug.

### Release parity failure

Examples:

- F-Droid builds successfully but reference APK comparison differs;
- signing/certificate mismatch.

Do not update fdroiddata. Diagnose exact unsigned/signed artifact differences first.

### Remote-only failure

If all local gates are green but fdroiddata fails:

1. capture the remote image/fdroidserver/fdroiddata revisions and the runner class;
2. compare them with `scripts/fdroid/pins.env`;
3. distinguish **container/toolchain parity** from **host-runner parity**;
4. reproduce the remote runner behavior in a disposable diagnostic branch before changing the production recipe;
5. prefer artifact-only or environment-only probes over repeated full Android builds when GitLab CI minutes are limited;
6. do not patch the production recipe blindly from the remote log.

### 2026 remote reproducibility investigation

The fdroiddata build for versionCode 9 exposed a host-runner-dependent APK difference. The GitHub harness produced unsigned APK SHA-256
`c1e9a6f4f4d0c246b14d069ffa7833f364e2ce6c751e71e6bb6e63d5bc557969`, while the F-Droid/GitLab runner produced
`31343023a1e0d7e3741c8fadbfcce7a27b21cc775c7e333021f6593f3f5e6f4f`.

The build itself succeeds on both runners. F-Droid's signed-reference comparison reports differences only in:

- `assets/dexopt/baseline.prof`;
- `classes.dex`;
- `resources.arsc`.

The following causes have been tested and **ruled out**:

- source revision mismatch: both builds use source SHA `f5a6762bc092c3f9295658354aeaa76315fa84ec`;
- fdroidserver revision mismatch: both use `a35fdfddd9c66823987a410566a6101186e39c84`;
- buildserver image mismatch: both use digest `sha256:9cb68105642ca4e7b295f0ceab10f069f5b3247dc18fa7c36046e9d81aa469a8`;
- fdroiddata build-job logic: the relevant build job is equivalent between the tested target and MR revisions;
- metadata/recipe mismatch: upstream `.fdroid.yml` and fdroiddata metadata are build-equivalent apart from tag versus resolved SHA;
- `CI=true`: both real and simulated build paths explicitly unset `CI` for `fdroid build`;
- `apt-get dist-upgrade` and the observed rsync/OpenSSL/androguard package updates;
- `gradlew-fdroid` update state;
- JDK mismatch: GitLab uses Debian OpenJDK 21.0.12.1, matching the simulated path;
- locale/timezone mismatch: GitLab uses `C.UTF-8` and UTC;
- ordinary Gradle CPU parallelism: pinning the entire Gradle process to one CPU still produced the exact GitLab/F-Droid hash `31343023...`;
- simple filesystem directory-entry ordering: deliberately sorted and deliberately reversed directory insertion orders on GitHub both produced the same good hash `c1e9a6f4...`;
- R8 minification/optimizer behavior: the release task graph does not run `minifyReleaseWithR8`; the differing DEX is produced through D8/DEX merge tasks instead.

Also observed:

- GitLab's failing runner class is `saas-linux-medium-amd64`;
- the probed host used Linux 5.15.154 and an Intel Xeon Platinum 8581C with four visible CPUs;
- `/home/vagrant` is overlayfs on GitLab, so a simple host-filesystem-type mismatch there is not supported by the probe;
- GitLab exposes many `CI_*` and `GITLAB_*` variables even when the single `CI` variable is unset before `fdroid build`.

Still open:

- another host/kernel/CPU-sensitive Android/Expo/Gradle input not covered by single-CPU execution;
- GitLab-specific environment variables influencing Expo prebuild, Gradle, D8, AAPT2, or generated Android sources/resources;
- generated Android source/resource differences before Gradle packaging;
- lower-level D8/AAPT2 behavior that depends on runner/host characteristics.

Do **not** re-run any ruled-out experiment unless the relevant toolchain/source changes. Add new evidence to this section instead.

### Confirmed fixes and remaining validation (2026-10-03)

PR #47 backports deterministic Glide KSP module ordering. The full production
recipe now produces identical DEX and ART profile entries on GitHub and GitLab.
The two GitHub source builds at `f5261fe2da2da67124718ee0947b032ccd49ba6c`
produced APK SHA-256 `1927eeb887398ce227b4240376f431cd5cbf5f8223f8a47de71457a0cb01af85`.
GitLab job `16913602113` built the identical source tree at merged commit
`ffcad1fe0cad8956bc0f5390c9b67ad08284e5ce` and produced
`0ece9f2f9fd2c27a2d63fade633353c8019a5c64d0730c3c481cf582fa9515a8`.

Artifact inspection found 1,266 identical entries. Only `resources.arsc`
differed, in exactly two bytes: the `react_native_dev_server_ip` string was
`172.18.0.2` on GitHub and `172.17.0.3` on GitLab. This is React Native's
documented Gradle-property fallback to the builder's IP, not an AAPT2 ordering
issue. The earlier targeted fix in PR #46 was still unmerged when #47 was built.

The upstream Expo reproducibility plugin now sets `reactNativeDevServerIp` to
`localhost` using Expo's parsed Gradle-properties model. It removes prior
definitions before adding exactly one canonical value. The pre-build guard
rejects missing/conflicting definitions, and final APK verification uses AAPT2
to require the actual default `string/react_native_dev_server_ip` value to be
`localhost`. This catches command-line/user Gradle overrides too. No APK bytes
are patched to fix this resource.

Fast regression checks run before Android compilation in CI:
`node --test scripts/test-reproducible-gradle.mjs`. They cover missing properties,
different host IPs, duplicates, idempotency, and the generated-project guard.
Full unsigned-APK parity was subsequently confirmed with both fixes present.
GitHub run `37134050591` produced two byte-identical APKs at PR source commit
`2211430306d34c65c46b8554e54dc6b35d90a35d`. GitLab pipeline #111
(`2909442996`), job `16914108034`, built merged source commit
`e7c562dada984993e81cd54d4c22dbde21208665`; its Git tree is identical to the
green PR source tree (`217b65784815a76c85c0d1a4fe990ba166f2ffa0`). All three
unsigned APKs have SHA-256
`faa0db483d754ae936ae6962908bc3a697a4cf39d02e3d8bab9bb24fe54d817c`.
The packaged dev-server resource check passed on both runners. No sorted
directory preload was needed for this production comparison.

This proves cross-runner determinism for that source tree. Release 1.0.10 subsequently passed source, scanner and signed-reference
verification and was published immutably. The 1.0.11 candidate introduces R8
and per-ABI packaging, so each new ABI must pass these gates again. Existing
tags and APKs must not be replaced.

## Desired end state

A healthy F-Droid release should be uneventful:

```text
canonical .fdroid.yml
        |
        +--> structural source derivation --> pinned F-Droid source build x2 --> identical APKs
        |
        +--> immutable release --> sign exact F-Droid APK --> canonical release verification
        |
        +--> fdroiddata update --> remote runner parity must still be confirmed
```

If the remote build is routinely teaching us something the local gates could have known, improve the gates rather than adding another remote-only workaround. A green GitHub buildserver simulation must not be described as proof of GitLab/F-Droid runner parity until that parity has actually been demonstrated.

## ABI packaging after maintainer review (2026-10-05)

The harness now requires `FDROID_ABI` for source/released verification. It
calculates the selected APK code from the base code and the checked-in ABI map.
Each ABI is built twice independently and matching ABI artifacts are compared.
Source derivation removes every per-build `binary` as well as `Binaries` and
`AllowedAPKSigningKeys`; only the selected build's source commit is changed.
Release verification keeps each ABI's signed-reference URL unchanged.

R8 is now enabled, so the old observation ruling out R8 applies only to the
historical unminified build. Re-evaluate new optimizer failures against actual
mapping, missing-class and reproducibility evidence. Mapping files are required
and exported. The x86_64 APK must also pass emulator installation/startup.
See [the release process](fdroid-release.md) for the full four-ABI release gates.
