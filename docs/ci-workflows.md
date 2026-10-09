# CI workflow routing

Pull requests and pushes to `main` start three lightweight entry workflows:
CI, F-Droid buildserver simulation and Docker self-hosting. Each calls
`.github/workflows/changes.yml`, which checks patch whitespace, tests the routing
policy and classifies the changed paths using `scripts/ci/changes.mjs`. Expensive
jobs run only when their inputs changed. Documentation-only PRs still report
status checks, but do not install npm dependencies, download PocketBase, compile
Android, start an emulator or build Docker images.

## Coverage

| Changes | Source quality and web export | PocketBase schema | Android/F-Droid | Docker smoke and multi-architecture builds |
| --- | --- | --- | --- | --- |
| Documentation, README, license | Skip | Skip | Skip | Skip |
| Diagnostic workflows/scripts | Skip | Skip | Skip | Skip |
| App source, dependencies, native modules, assets, plugins, patches, shared build configuration | Run | Skip | Run | Run |
| F-Droid metadata, harness, native verification/scanner scripts, Fastlane metadata | Run | Skip | Run | Skip |
| PocketBase migrations or schema test | Skip | Run | Skip | Run |
| Docker files, Compose, Docker smoke test or Docker workflow | Skip | Skip | Skip | Run |
| CI workflow or standalone regression test scripts | Run | Skip | Skip | Skip |
| Shared change detector or unknown production inputs | Run | Run | Run | Run |

Production icon generation and npm postinstall scripts affect both Android and
Docker. The classifier lists these explicitly. New production files default to
all gates unless assigned a narrower rule and covered by a regression test.
Documentation under `docs/`, Markdown files and the dedicated diagnostic paths
are excluded before production classification.

PR detection compares the merge base of the PR's base and head SHAs with its
head, rather than just the latest commit or a synthetic merge. Push detection
compares `before` and `after`; new branches use the full source tree. Renames
include both old and new paths, and deleted inputs retain their coverage.
Failures to resolve the comparison fail the checks instead of silently skipping
jobs. No API file-list pagination or GitHub path-filter file limit is involved.

## Stable checks and cancellation

`validate` and `validate-pocketbase` retain their existing CI check names and
always run after change detection. They succeed when their work is irrelevant,
and fail if detection or their relevant checks fail. `Android source gate` and
`Docker self-hosting gate` similarly summarize all relevant matrix jobs. The
Android gate includes both independent builds for every ABI, comparison and
x86_64 emulator startup. Gate jobs use `always()` so an upstream failure cannot
turn into a successful skipped gate. Workflows have no event-level path filters
that could leave a required check pending.

The active `main` ruleset was inspected for issue #45: it requires pull requests
and has no required status checks configured. No repository rules were changed.
If required checks are added, use `validate`, `validate-pocketbase`,
`Android source gate` and `Docker self-hosting gate`. Existing build and
comparison jobs remain available for detailed results.

CI and the F-Droid source simulation cancel superseded runs for the same PR or
`main` ref. Docker cancels superseded PR runs, but does not interrupt publishing
on `main` or version tags. The production Android release workflow is unchanged
and is never cancelled automatically by this policy. Manual Android smoke and
alternate reproducibility runs cancel older runs of the same workflow/ref.
Concurrency groups include the workflow and event so PR and push runs cannot
cancel one another.

## Adding diagnostics and workflows

Put investigation-only scripts in `scripts/diagnostics/` and name their workflows
`.github/workflows/diagnostics-<purpose>.yml`. Those paths do not trigger the
application, Docker or full F-Droid suites. A diagnostic can use
`workflow_dispatch` alone, or PR path filters scoped to its own workflow and
exact script inputs. Use read-only permissions and a concurrency group scoped
to that workflow and PR/ref when it is safe to cancel earlier runs. Do not use
broad `.github/workflows/**` or `scripts/**` filters for an expensive diagnostic.

A production change mixed into a diagnostic PR still runs its normal gates.
Manual F-Droid simulation requests always run the full matrix; manual alternate
Android reproducibility and test-signing smoke remain standalone diagnostics.
Version-tag Docker pushes always build and publish both images after smoke
validation. Production Android tag/signing/reference-parity behavior is retained.

For a new production workflow, declare its input paths in the shared classifier
and add tests showing both affected and unrelated changes. Keep its aggregate
check unconditional, require successful change detection, and accept skipped
work only when the classifier says it is irrelevant. Shared routing changes
intentionally exercise all gates once.

## Local validation

Run `node --test scripts/ci/changes.test.mjs` for routing and real Git-diff
regressions. Run `actionlint` for Actions syntax and expression validation, plus
`npm run validate:fdroid-metadata` for the production harness invariants. The
routing tests use temporary Git repositories; no network or npm install is
needed to run them in GitHub Actions.
