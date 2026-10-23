# Deploy the disposable HomeLibrary demo to Render Free

**Current recommended hosting provider**: Render Free. It supports free public
Docker web services without requiring a credit card. Free instances have
512 MiB memory / 0.1 CPU and lose filesystem data whenever they sleep, restart
or redeploy. They spin down after 15 minutes without inbound traffic, and take
roughly one minute to wake. This matches HomeLibrary's intentionally disposable
demo (but is not suitable for a real household library).

Never attach a real household volume or use real personal data in this demo.
The entrypoint intentionally **deletes all of `/pb_data` on each start**.

## 1. Merge the GitHub PR

Merge the public-demo PR only after the `Disposable demo backend` workflow is
green. The demo is isolated from the normal HomeLibrary backend image.
Use the `main` branch as your source after merging.

## 2. Create the Render web service

1. Create a free account at https://dashboard.render.com (no payment method
   required). Connect your GitHub account and authorize repository access.
2. Choose **New → Blueprint**. Pick `DitisKees/homelibrary-app`, `main`,
   and set the Blueprint file path to `docker/demo/render.yaml`. Review the
   proposed single **Free** web service named `homelibrary-demo`. Confirm it
   shows the **Frankfurt** region and no database or persistent disk, then apply.
3. Alternatively, choose **New → Web Service**, connect the same GitHub repo,
   and configure **Runtime: Docker**, **Branch: main**, **Root directory:
   repository root**, **Dockerfile path: docker/demo/Dockerfile**,
   **Plan: Free**, **Region: Frankfurt**, **Environment variable: PORT=8090**,
   and **Health check path: /api/health**. Do not override the container
   entrypoint or add a persistent disk.
4. Wait until the service is **Live**. Copy its public HTTPS
   `https://...onrender.com` URL from the Render dashboard.
5. Browser-test `https://<actual-render-host>/api/health`. A first request
   after sleep may take roughly a minute. If the service fails, inspect its
   Render deployment logs.

**Important:** Use the hosted **PocketBase API** URL in HomeLibrary, not
the GitHub repository URL, and do not append `/api/health` when configuring
the Android application.

## 3. Log in and test

Public accounts (the exact same credentials for everyone who chooses an account):

| Email | Password |
| --- | --- |
| `demo1@example.invalid` | `HomeLibrary-Demo-2026!` |
| `demo2@example.invalid` | `HomeLibrary-Demo-2026!` |

URL: https://homelibrary-demo.onrender.com

On first startup, PocketBase initializes 16 sample books, example reading
statuses and loans. Any authenticated tester can add, edit and delete books,
and see data written by other testers. Demo accounts cannot change their
credentials. Do not enter personal information.

To confirm the reset:
- Add a temporary book on Android.
- In Render select the service → **Manual Deploy → Restart service**.
- Reopen the app, log out and back in if its old token fails. The original 16
  books should be restored, and the temporary book should be gone.
- Repeat after 15+ minutes of genuine inactivity to test automatic sleep and
  the wake-up behavior. Note that PocketBase realtime connections may keep the
  service awake when they remain active, so an inactivity reset is not a
  fixed-time guarantee.

## 4. Nightly reset without rebuilding

The GitHub workflow `.github/workflows/demo-reset.yml` calls Render's official
`POST /v1/services/{serviceId}/restart` endpoint at **02:00 UTC** daily
(03:00 CET / 04:00 CEST), with optional manual `workflow_dispatch`.
A restart reuses the existing build rather than spending build minutes on a
Docker rebuild. GitHub's scheduled execution may be delayed.

1. In Render, open **Account Settings → API Keys**, create an API key, and
   copy it somewhere private. Never commit it or share it publicly.
2. In your Render service's dashboard, copy the **Service ID**, starting
   with `srv-` (find it in the service's dashboard or service URL).
3. In GitHub open **Settings → Secrets and variables → Actions**:
   - **Repository secret**: `RENDER_API_KEY` = your Render API key.
   - **Repository variable**: `RENDER_SERVICE_ID` = actual `srv-...` ID.
4. Go to **Actions → Nightly public demo reset → Run workflow**.
   Verify that the `render-restart` job succeeds and that the seed data
   reappears after a restart. The Koyeb job should be skipped.
5. If you later disable the public demo, delete/suspend the Render service,
   remove the repo variable, and disable the scheduled workflow.

The API key is an account-level secret. Restrict who can edit your GitHub
Actions workflows and rotate/revoke the key if exposed. A missing API key makes
the scheduled job fail rather than pretending the reset succeeded.

## 5. Roll out security fixes and new backend versions

The demo Dockerfile now uses
`ghcr.io/ditiskees/homelibrary-backend:main` instead of the release-only
`latest` tag. This lets it receive patched PocketBase images without
waiting for a new Android release.

**A nightly restart does not fetch an updated image.** Render's automatic
deployment may also begin before GitHub finishes publishing the new
multi-architecture `main` image to GHCR. After merging a backend/security
change:

1. Verify the **Docker self-hosting** GitHub Actions workflow is green on
   `main` and that `ghcr.io/ditiskees/homelibrary-backend:main` was published.
2. In Render choose **Manual Deploy → Clear build cache & deploy** for
   `homelibrary-demo`, rebuilding the demo against the patched base image.
3. Check Render's logs, `/api/health`, and login to confirm the 16 seeded
   books are present. This redeploy intentionally wipes all demo changes.
4. After the patched image is deployed, nightly resets can continue to
   use the much cheaper service-restart API.

For a security-sensitive rollout, do not rely solely on
`autoDeployTrigger: checksPass` or on the nightly restart.

## 5. Limitations and privacy warning

- This is **not** a reliable hosted service. Render Free may suspend it,
  and every restart/sleep loses SQLite records and uploaded covers.
- Render gives free web services **750 running-instance hours per workspace
  per month**; bandwidth and build minutes have separate limits. Without a
  payment method, overrunning some limits suspends service or builds, rather
  than charging a card. Monitor consumption in Render's Billing dashboard.
- Cold starts may cause HomeLibrary's current `/api/health` initial
  connection test to time out. Wake via browser, then retry Android setup.
- All users of the same demo account can see each other's edits and loans.
  **Do not provide real names, contact details or confidential information.**
- Seed data contains only fictional contacts and classic book titles.
  Requests may still be recorded in platform access logs; database resets are
  not a guarantee of complete erasure.
- Do not use the demo database for a permanent collection and do not publish a
  PocketBase superuser account.

Further documentation:
- Render Free: https://render.com/docs/free
- Render Blueprint spec: https://render.com/docs/blueprint-spec
- Render restart API: https://api-docs.render.com/reference/restart-service
