# Self-hosting HomeLibrary with Docker

Docker Compose is the recommended way to run the HomeLibrary backend and optional web client. The repository also keeps a manual PocketBase procedure in [`../pocketbase/README.md`](../pocketbase/README.md).

HomeLibrary does not provide a hosted service. You operate the PocketBase server, TLS, backups, accounts, and upgrades yourself.

## Published images

Tagged HomeLibrary releases publish multi-architecture images for `linux/amd64` and `linux/arm64`:

- `ghcr.io/ditiskees/homelibrary-backend:<version>`
- `ghcr.io/ditiskees/homelibrary-web:<version>`

The backend image pins the supported PocketBase version and includes the committed HomeLibrary migrations. The web image contains a static Expo export served by unprivileged nginx; Node.js is not present in the runtime image.

Use an exact HomeLibrary version in production. Stable semantic-version releases also update `latest`; prerelease tags do not. An exact version makes upgrades deliberate and keeps the PocketBase version traceable.

## 1. Prepare the Compose configuration

Copy [`../compose.example.yml`](../compose.example.yml) to the machine that will run HomeLibrary. You may use it directly or copy it to `compose.yml`.

Create a `.env` file next to it:

```dotenv
HOMELIBRARY_VERSION=1.0.0
POCKETBASE_URL=https://books-api.example.com
```

`POCKETBASE_URL` is public browser/client configuration, not a credential. It must be the externally reachable **HTTPS** URL of the PocketBase backend. Do not put passwords, tokens, certificates, or backup credentials in the Compose file or Git.

The example binds both container ports to `127.0.0.1` by default:

- PocketBase: host port `8090` → container port `8090`
- web client: host port `8080` → container port `8080`

Optional environment values for the Compose invocation are:

```dotenv
BIND_ADDRESS=127.0.0.1
POCKETBASE_PORT=8090
WEB_PORT=8080
HOMELIBRARY_DATA_VOLUME=homelibrary-pb-data
HOMELIBRARY_NETWORK=homelibrary
```

Do not expose PocketBase directly to the public Internet in a normal production deployment. Put an HTTPS reverse proxy in front of it.

## 2. Start the services

Pull and start the selected release:

```bash
docker compose -f compose.example.yml pull
docker compose -f compose.example.yml up -d
```

Check the state:

```bash
docker compose -f compose.example.yml ps
curl http://127.0.0.1:8090/api/health
```

The backend stores its authoritative state in the named volume mounted at `/pb_data`. Pending forward migrations are applied when PocketBase starts.

If `POCKETBASE_URL` is omitted, the web image still starts and HomeLibrary shows the server-setup flow. If a non-HTTPS or otherwise unusable deployment value is provided, the web container fails explicitly or the client rejects the URL rather than silently connecting to an insecure remote server.

## 3. Create the first PocketBase superuser

Do not store the initial administrator password in Compose or Git. Create the account interactively after the backend is running:

```bash
docker compose -f compose.example.yml exec backend \
  pocketbase superuser create you@example.com 'choose-a-long-unique-password' \
  --dir=/pb_data
```

The password appears in your shell history if you type it literally in the command. On a sensitive system, use your shell's history controls or an interactive secret-management workflow appropriate for your environment.

Open the PocketBase dashboard through your HTTPS backend URL, normally:

```text
https://books-api.example.com/_/
```

Use a strong unique superuser password. Enable additional PocketBase administrator protections appropriate for your deployment as described in [`security-and-backups.md`](security-and-backups.md).

## 4. Create household users

Public self-registration is intentionally disabled. Sign in to the PocketBase dashboard as a superuser, open the `users` auth collection, and create an account for each household member.

Users sign in to HomeLibrary with those email/password credentials. Do not use the PocketBase superuser account as an ordinary HomeLibrary user.

## 5. Put HTTPS in front of the services

Use a maintained reverse proxy such as Caddy, nginx, Apache, Traefik, or your existing ingress. A typical layout uses separate hostnames:

```text
https://books.example.com      -> HomeLibrary web :8080
https://books-api.example.com  -> PocketBase      :8090
```

If the reverse proxy runs directly on the host, it can proxy to the default `127.0.0.1` bindings. If it runs in Docker, attach it to the `${HOMELIBRARY_NETWORK:-homelibrary}` network and proxy to `web:8080` and `backend:8090` instead of publishing the application ports publicly.

For example, a Caddy container on the same Docker network can use:

```caddyfile
books.example.com {
    reverse_proxy web:8080
}

books-api.example.com {
    reverse_proxy backend:8090
}
```

Configure PocketBase's trusted user-IP proxy headers for your proxy so rate limiting, logs, and administrator IP restrictions see the real client address. See the production-hardening notes in [`security-and-backups.md`](security-and-backups.md).

## 6. Persistence and ownership

The `pb_data` named volume contains the SQLite database, uploaded covers/files, PocketBase settings, migration history, and local backups. Replacing the backend container does not replace this volume.

The backend process runs as an unprivileged user with UID/GID `10001`. The supported Compose example uses a named volume. If you replace it with a bind mount, ensure that the directory is writable by UID/GID `10001` before starting the container.

Never delete the data volume as part of a routine image upgrade.

## 7. Backups and off-host copies

A HomeLibrary migration supplies a conservative local default when no schedule exists yet:

```text
03:00 every day
retain 14 scheduled restore points
```

It deliberately does not overwrite an operator-defined backup schedule.

A production deployment is not considered adequately backed up merely because local scheduled backups exist. Keep at least one copy on a different host or storage device. The preferred approach is to configure PocketBase's built-in backup S3 settings in **Dashboard → Settings → Backups** using a dedicated S3-compatible backup bucket. Keep those credentials out of this repository and restrict access to administrators/backup tooling.

If you do not use PocketBase backup S3, automate copying or downloading backups to another machine/storage system and periodically verify that new copies continue to arrive. Use encryption at rest where the destination does not already provide suitable protection.

Immediately before every PocketBase/schema upgrade, create an on-demand backup from the Dashboard or backup API and verify that the off-host copy exists.

The repository's Docker CI performs a synthetic backup-and-restore drill against disposable data. That proves the image/migration/restore path; it does **not** prove that your production off-host destination is configured correctly.

## 8. Perform an isolated restore drill

Do this before relying on HomeLibrary as the authoritative copy of your household catalogue.

1. Select a known-good backup and make a separate copy available to an isolated HomeLibrary backend.
2. Start an isolated backend with an empty data volume and the same compatible HomeLibrary/PocketBase version.
3. Upload the backup through PocketBase's backup interface and restore it.
4. Wait for PocketBase to restart and verify `/api/health`.
5. Sign in using an expected account.
6. Verify representative books, reading status, and loans.
7. Open/download at least one uploaded cover or file and confirm it is intact.
8. Record the date, backup name, HomeLibrary version, PocketBase version, and result.

For more detail and the filesystem-level fallback procedure, see [`security-and-backups.md`](security-and-backups.md).

## 9. Upgrade HomeLibrary

Before changing versions:

1. confirm the latest scheduled backup exists;
2. create an on-demand backup;
3. confirm an off-host copy exists;
4. read the release notes.

Then update `HOMELIBRARY_VERSION` and run:

```bash
docker compose -f compose.example.yml pull
docker compose -f compose.example.yml up -d
```

Verify backend health, sign-in, library reads/writes, lending, reading status, and at least one cover.

HomeLibrary supports **forward** migrations. It does not implement automatic database/schema downgrades. If an upgrade changes the schema and you must roll back, restore the pre-upgrade backup into a compatible version rather than assuming that starting an older image will undo migrations safely.

## 10. Repoint the web image without rebuilding it

The web image reads `POCKETBASE_URL` when the container starts and writes it to a small `runtime-config.js` file. The Expo application is not rebuilt for a server change.

Change the value and recreate only the web service:

```bash
POCKETBASE_URL=https://new-books-api.example.com \
docker compose -f compose.example.yml up -d --force-recreate web
```

A user-specific server selected inside HomeLibrary still takes precedence over the deployment default. Resetting the server in settings returns to the current container-supplied default.

No credentials or auth tokens belong in `POCKETBASE_URL` or `runtime-config.js`.

## Android first-run configuration

The Android app connects directly to PocketBase; it does not need the HomeLibrary web container. On first launch, enter the externally reachable HTTPS **backend** URL, for example:

```text
https://books-api.example.com
```

The app tests `/api/health` before saving it. If no backend exists yet, the setup screen links back to this self-hosting guide.

## Manual PocketBase alternative

Docker is recommended because it pins the supported PocketBase version, ships the migrations with it, supplies health checks, and makes upgrades repeatable. If Docker is not suitable, follow [`../pocketbase/README.md`](../pocketbase/README.md) for the manual PocketBase installation and run the HomeLibrary client separately.
