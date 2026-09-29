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
scripts/fdroid/run-source-build.sh <40-character-source-sha> .fdroid.yml
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
scripts/fdroid/run-release-verification.sh .fdroid.yml
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

### Pull request / main source gate

`.github/workflows/fdroid-buildserver-simulation.yml`:

1. checks out the exact PR head or main SHA;
2. verifies Git access inside the pinned container;
3. runs two independent source-build jobs;
4. exports both unsigned APKs;
5. requires byte-for-byte equality.

This gate proves that the source candidate is buildable through the F-Droid path and deterministic under the pinned harness.

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
- Android reproducibility;
- two-copy F-Droid source buildserver simulation;
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
6. runs normal Android reproducibility;
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

1. capture the remote image/fdroidserver/fdroiddata revisions;
2. compare them with `scripts/fdroid/pins.env`;
3. reproduce the remote toolchain difference in a dedicated pin-update PR;
4. do not patch the production recipe blindly from the remote log.

## Desired end state

A healthy F-Droid release should be uneventful:

```text
canonical .fdroid.yml
        |
        +--> structural source derivation --> pinned F-Droid source build x2 --> identical APKs
        |
        +--> immutable release --> sign exact F-Droid APK --> canonical release verification
        |
        +--> fdroiddata update --> remote build confirms what already passed
```

If the remote build is routinely teaching us something the local gates could have known, improve the gates rather than adding another remote-only workaround.
