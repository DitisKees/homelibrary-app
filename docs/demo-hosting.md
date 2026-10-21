# Public, disposable HomeLibrary test backend

**Recommended deployment: [Render Free](demo-render.md).** Koyeb's Starter free plan stopped accepting new organizations in February 2026, so the Koyeb steps below are retained only for accounts that still have an eligible existing organization.

This deploys a **public, untrusted test service**, not a managed household library.
It is independent of normal self-hosting. There is **no permanent data**,
guaranteed uptime or privacy between demo accounts. Do not use real personal data.

## Legacy Koyeb setup (eligible existing Starter organizations only)

For the current supported free-provider instructions, see [Render](demo-render.md).

## What is deployed

- One free Koyeb **Web Service**, preferably in Frankfurt (FRA), using
  `docker/demo/Dockerfile` and the repository root as Docker build context.
- A special image derived from `ghcr.io/ditiskees/homelibrary-backend:latest`,
  plus **demo-only** PocketBase migration and disposable startup script.
- HTTPS provided by Koyeb and PocketBase on container port `8090`.
- Fresh sample data **on every container/process start**. Storage may also be
  discarded during Koyeb inactivity, rescheduling and upgrades.
- Optional nightly redeployment from GitHub Actions at **02:00 UTC**
  (03:00 CET / 04:00 CEST). Schedule is approximate; GitHub may delay runs.

The startup script **deletes all files in `/pb_data`** before PocketBase starts.
Never use this image with a real household data volume, including for testing.

Koyeb Free has 512 MB RAM, 0.1 vCPU, and 2 GB ephemeral disk. It sleeps after
one hour without traffic and does not support persistent volumes. A fresh startup
might take a while. A free instance may be unavailable if you already consume
your organization's single free Web Service allocation.

## Step 1 — Merge and test

1. Merge the public-demo pull request only after the `Disposable demo backend`
   GitHub Action passes. This test builds the **real PocketBase backend**
   and checks authentication, demo records, restricted user updates, creating
   a test book, restarting on the *same Docker volume* and complete reseeding.
2. Nothing here should change the regular PocketBase migrations or the
   production Docker image, and no Android release or F-Droid artifacts change.
3. Do not deploy the feature branch as the long-term source. Use `main`
   after merge.

## Step 2 — Create the Koyeb free service

1. Sign in at https://app.koyeb.com. Select **Create Web Service**.
2. Select **GitHub** source and connect the GitHub account owning
   `DitisKees/homelibrary-app`; allow the Koyeb GitHub app access to that
   repository. Selecting the repository from your linked account permits
   automatic deployment when its tracked branch changes. Supplying only a
   public GitHub repository URL does **not** offer that automatic integration.
3. Choose repository `DitisKees/homelibrary-app`, branch `main`.
4. Select **Dockerfile** builder, Dockerfile path
   `docker/demo/Dockerfile`, project/build context = **repository root**.
   Leave the Docker build arguments at their defaults.
5. Choose **Free** Web Service, region **Frankfurt**, instance count **1**.
   Do not configure a persistent volume or a worker service. Leave the free
   service's default inactivity sleep enabled.
6. Set service HTTP port **8090**; route `/` to port `8090`.
   If offered, use HTTP health check `/api/health`; otherwise the platform's
   default TCP check is acceptable. Leave runtime entrypoint/command empty:
   the demo image has its own entrypoint.
7. Name the Koyeb app, for example `homelibrary-demo`, and its service
   `api`. These are examples: record the actual names for Step 4.
8. Deploy. Verify the service reaches Healthy and note the public HTTPS URL
   shown in Koyeb, such as `https://<assigned-host>.koyeb.app`.
   Do **not** enter example hostnames literally.

Never set a real superuser password, S3 credentials, SMTP credentials,
environment secrets or production data on this demo. It creates an unreachable
superuser with a random password solely to prevent public first-run installation.

## Step 3 — Verify from Android and a browser

Open `https://<your-actual-koyeb-domain>/api/health` in a browser; it should
return a successful JSON response (the first request after sleep may take
longer). Enter the **same HTTPS base URL**, without `/api/health`, on
HomeLibrary's Android first-run server setup screen.

Public demo accounts:

| Email | Password |
| --- | --- |
| `demo1@example.invalid` | `HomeLibrary-Demo-2026!` |
| `demo2@example.invalid` | `HomeLibrary-Demo-2026!` |

These accounts deliberately have **known public credentials**; all users who
know one of them can view and edit that account's records. The database is
initially populated with 16 books, reading statuses and loan examples.
Uploads are limited to 2 MiB per cover and request rates are constrained.
The example catalog is editable (including deletion), so another tester may
change it until the next reset.

**Warning to show testers:** This server is public, shared and disposable.
Anyone using the same account can see your changes. Data can be deleted
without notice after inactivity, a restart or the nightly reset. Do not enter
real names, contact details, private book collections or confidential data.

HomeLibrary may retain an old authentication token between server restarts.
If sign-in or API requests fail after a reset, log out and sign in again.
For the Android F-Droid build, HTTPS is mandatory for remote endpoints.

## Step 4 — Enable nightly reset (optional, recommended)

The workflow `.github/workflows/demo-reset.yml` runs daily at 02:00 UTC
and also supports manual operation. It has **no effect** until the GitHub
repository's Actions settings have both variables configured.

1. In Koyeb, generate an API token with permission to redeploy this service
   (Koyeb account settings → API access/tokens). Keep it secret.
2. In GitHub open
   `DitisKees/homelibrary-app → Settings → Secrets and variables → Actions`.
3. Under **Secrets**, create repository secret **`KOYEB_TOKEN`** with the
   actual token. Never add it as a variable, commit or workflow input.
4. Under **Variables**, create **`KOYEB_APP`** containing the actual Koyeb
   app name, e.g. `homelibrary-demo`, and **`KOYEB_SERVICE`** containing
   the actual service name, e.g. `api`.
5. Go to **Actions → Nightly public demo reset → Run workflow**. Confirm the
   CLI redeploy completes and that `/api/health` becomes healthy.
   The workflow requests `--skip-build`; the demo entrypoint clears data
   on the resulting new process start.
6. Test one complete cycle: create a temporary book, manually run the workflow,
   then sign in again and confirm the extra book disappeared.

To stop scheduled redeployments, disable the workflow, or remove those two
repository variables. Never give this workflow an elevated GitHub token.

## Limits, troubleshooting and rollback

- Koyeb Free is for evaluation only; don't promise uptime to F-Droid reviewers.
- Each startup seeds a new SQLite database; a pending cold start may delay the
  app's first-run health check. Retry after the health endpoint responds.
- Changes are not isolated between testers; do not upload anything private.
  Even with SQLite resets, service/access logs may have separate retention.
- Heavy uploads or excessive requests can exhaust free limits; monitor Koyeb
  usage and stop the service if abused.
- If the service fails to start, check the Koyeb deployment logs for PocketBase
  migration errors and the Dockerfile path. The demo has no backup by design.
- The image uses the latest *published release* backend. Redeploy after
  releasing a new backend version; an image rebuild is required to pick up
  a newer `latest` base.
- To disable the public demo, delete/pause the Koyeb service and disable the
  nightly reset workflow. Normal self-hosted Docker deployments are unaffected.

See https://www.koyeb.com/docs/build-and-deploy/deploy-with-git and
https://www.koyeb.com/docs/reference/instances for current platform details.
