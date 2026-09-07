# Production security, backups, and recovery

This document defines the production baseline for a HomeLibrary PocketBase server. It applies to manual installations and to the Docker deployment planned in issue #5.

HomeLibrary is self-hosted. The operator is responsible for the server, TLS, backups, PocketBase administration, and recovery.

## Client transport policy

Public/release HomeLibrary builds accept only `https://` PocketBase endpoints. Credentials and library data must not be sent to an arbitrary clear-text remote server.

Plain `http://` is accepted only by development builds and only for local development targets such as localhost, Android emulator host mappings, or private LAN addresses. This exception is controlled by the compiled `__DEV__` flag and is unavailable in release builds.

Changing the configured PocketBase endpoint signs the user out, clears the client query cache, and clears the persisted authentication state before the new server is used.

## Native credential storage

Android and iOS store the serialized PocketBase authentication state with `expo-secure-store` rather than ordinary AsyncStorage:

- Android: encrypted storage protected by the Android Keystore;
- iOS: Keychain-backed storage.

The old native `pb_auth` AsyncStorage entry is intentionally **not migrated**. On the first launch after upgrading from an older build it is deleted and the user must sign in once again. This avoids copying a credential from unprotected storage into the new secure store.

Web clients continue to use browser-backed storage because Expo SecureStore has no web equivalent. The web browser threat model is therefore different from the native-app storage model.

## HTTPS and reverse proxy

Expose PocketBase to clients only through HTTPS in production. A reverse proxy such as Caddy, nginx, Apache, or another maintained proxy may terminate TLS in front of PocketBase.

When a reverse proxy is used:

1. keep the PocketBase service itself on a private/container/loopback network where practical;
2. expose only the reverse proxy's HTTPS port publicly;
3. renew certificates automatically and monitor renewal failures;
4. forward the original host/protocol and client IP headers;
5. configure PocketBase **User IP proxy headers** so logs, rate limiting, and superuser IP restrictions see the real client address rather than only the proxy address.

PocketBase documents common `X-Real-IP` / `X-Forwarded-For` reverse-proxy handling at https://pocketbase.io/docs/going-to-production/.

## Network and PocketBase hardening

For an internet-reachable HomeLibrary server:

- enable PocketBase's built-in rate limiter and review limits after observing normal household traffic;
- use a long, unique superuser password;
- enable MFA/OTP for the `_superusers` collection when mail delivery is configured reliably;
- use the PocketBase superuser IP/subnet whitelist when the administration workflow has stable trusted addresses or networks;
- do not expose the PocketBase service port directly to the public Internet when a reverse proxy is in use;
- firewall the host so only required management and HTTPS traffic is reachable;
- restrict filesystem access to `pb_data`, backup material, configuration, and any encryption keys;
- do not store credentials, tokens, certificates, household URLs, or server secrets in this Git repository;
- review PocketBase logs and configure host/container log retention so disk usage remains bounded;
- keep public user self-registration disabled unless the product architecture is deliberately changed and reviewed;
- consider PocketBase settings encryption (`--encryptionEnv`) if the database contains SMTP/S3 credentials and ensure the encryption key is backed up separately from the database.

PocketBase's production guidance currently recommends rate limiting and supports superuser IP restrictions and MFA; see https://pocketbase.io/docs/going-to-production/.

## PocketBase version and upgrades

The repository's CI currently validates the committed migrations against the PocketBase version pinned by the workflow. Treat a PocketBase upgrade as an application change:

1. review the PocketBase release notes;
2. update the pinned version intentionally;
3. run migration/CI tests against a fresh database;
4. take an on-demand production backup immediately before upgrading;
5. upgrade forward and verify `/api/health`, login, library reads/writes, file/cover access, lending, and reading status;
6. do not assume an automatic schema downgrade is safe.

The Docker deployment in issue #5 must follow the same backup-before-upgrade rule.

## Persistent data

`pb_data` is the authoritative PocketBase runtime state. It contains the SQLite databases and, with local file storage, uploaded book covers/files. The committed `pb_migrations` directory is **not a backup of household data**.

Protect the storage device containing `pb_data` from accidental deletion and ensure the service/container user has only the permissions it needs.

## Backup baseline

A production HomeLibrary instance should have all of the following:

- automatic scheduled backups;
- multiple retained restore points;
- at least one backup copy stored outside the machine/storage device hosting production;
- access controls limiting backup access to administrators/backups tooling;
- encryption at rest where the backup destination is not already appropriately encrypted;
- monitoring or periodic checks that scheduled backups are still being produced;
- an on-demand backup immediately before PocketBase or schema upgrades.

### Recommended PocketBase built-in backup configuration

PocketBase's built-in backup creates a ZIP snapshot of `pb_data`. With local file storage this includes uploaded files. The backup can be stored locally or in S3-compatible storage, and PocketBase supports scheduled backup cron plus a maximum number of automatically retained backups.

A reasonable household starting policy is:

- one automatic backup per day;
- retain at least 14 daily restore points;
- store backups in a dedicated off-host S3-compatible backup bucket **or** copy locally produced backups to a separate machine/storage system automatically;
- apply a longer-term lifecycle policy at the off-host destination if historical monthly restore points are wanted.

Use a dedicated backup bucket rather than mixing backups with normal uploaded-file storage.

If HomeLibrary is configured to store uploaded collection files in S3, verify those uploaded objects have their own backup/versioning policy: PocketBase's `pb_data` backup does not copy externally stored S3 upload objects into the backup archive.

Official backup API/reference: https://pocketbase.io/docs/api-backups/

## On-demand backup before an upgrade

Preferred procedure:

1. confirm the most recent scheduled backup exists;
2. create a new PocketBase backup from **Dashboard → Settings → Backups** or the authenticated backup API;
3. wait for backup generation to finish successfully;
4. ensure the backup is present at the off-host destination before applying the upgrade;
5. record the backup name/date with the upgrade notes.

For a filesystem-level backup instead, stop PocketBase before copying/replacing `pb_data` so the copy is transactionally safe, as recommended by PocketBase.

## Restore procedure

Do not make the first restore attempt during a real outage. Perform a restore drill on an isolated instance first.

### Built-in backup restore

1. provision an isolated PocketBase instance compatible with the backup;
2. make the selected backup available to that instance (upload it if necessary);
3. trigger the restore from the Dashboard or backup API;
4. allow PocketBase to restart after the restore;
5. verify `GET /api/health` succeeds;
6. sign in with a test/expected account;
7. verify representative books, reading status, loans, and at least one uploaded cover/file;
8. verify the expected migration/schema state;
9. record the restore date, backup used, PocketBase version, and result.

PocketBase notes that restore restarts the process and recommends sufficient free space for the restore operation. See https://pocketbase.io/docs/api-backups/ and https://pocketbase.io/docs/going-to-production/.

### Filesystem restore

For a manual `pb_data` restore:

1. stop PocketBase;
2. preserve/rename the failed `pb_data` directory rather than immediately deleting it;
3. restore the known-good `pb_data` copy with correct owner/group permissions;
4. start PocketBase;
5. perform the same health/data/file checks listed above.

## Health and recovery checks

Basic backend health:

```text
GET https://your-server.example/api/health
```

After server recovery or an endpoint change, clients may need to re-enter the server URL and sign in again. HomeLibrary intentionally clears auth when the endpoint changes so a token issued by one PocketBase server is not carried into another server configuration.

## Operator verification still required

Automated repository tests can validate client transport policy, secure native persistence wiring, migrations, and application behavior, but they cannot prove the operator's external backup destination or a real production restore.

Before issue #4 is fully closed for a production household deployment, record that an operator has successfully:

- confirmed scheduled backups are being created;
- confirmed at least one copy is off-host;
- restored one backup into an isolated instance;
- verified representative database records and an uploaded cover/file after that restore;
- smoke-tested a native Android release build for login persistence, logout, endpoint changes, and HTTPS rejection.
