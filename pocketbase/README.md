# PocketBase backend

The HomeLibrary backend schema is versioned in `pb_migrations/`. Do not configure the required collections only through the PocketBase dashboard; schema changes that the app depends on should be represented by migrations committed here.

For production/self-hosted installations, **Docker Compose is the recommended path**; see [`../docs/self-hosting.md`](../docs/self-hosting.md). The procedure below remains available for development or operators who deliberately prefer a manual PocketBase installation.

## Supported PocketBase version

This repository currently targets **PocketBase 0.40.1**. PocketBase is pre-1.0 and its migration API can change between releases, so update the migration files and CI validation deliberately when upgrading PocketBase.

## Manual setup

1. Download and extract PocketBase 0.40.1 for your platform.
2. From the repository root, apply the committed migrations:

   ```bash
   ./pocketbase migrate up \
     --dir ./pocketbase/pb_data \
     --migrationsDir ./pocketbase/pb_migrations
   ```

   Starting PocketBase with the same `--dir` and `--migrationsDir` arguments also applies pending migrations automatically.

3. Create the first PocketBase superuser if the instance does not already have one:

   ```bash
   ./pocketbase superuser create you@example.com 'choose-a-strong-password' \
     --dir ./pocketbase/pb_data
   ```

4. Start PocketBase:

   ```bash
   ./pocketbase serve \
     --dir ./pocketbase/pb_data \
     --migrationsDir ./pocketbase/pb_migrations
   ```

5. Open the PocketBase dashboard and create the household members as records in the `users` auth collection. Public self-registration is intentionally disabled; household accounts are provisioned by a superuser.
6. Point `EXPO_PUBLIC_POCKETBASE_URL` in a locally built app's `.env` file at this PocketBase instance, or enter the server URL in HomeLibrary at runtime.

`pocketbase/pb_data/` contains the local database and uploaded files and must not be committed.

The committed backup-default migration configures a daily local backup at 03:00 with 14 scheduled restore points when the instance has no backup schedule yet. This is only a baseline: production operators must still configure an off-host backup destination/copy and perform an isolated restore drill as described in [`../docs/self-hosting.md`](../docs/self-hosting.md).

## Collections

### `users`

Auth collection used by the app's existing email/password login. Authenticated household users may list/view household members. A user may update their own normal record fields, while account creation, deletion, and auth-record management remain superuser-only.

### `books`

Shared household catalogue. All authenticated users may list, view, create, update, and delete books.

Fields:

- `title` — required text
- `author` — text
- `isbn10` — text
- `isbn13` — text
- `publisher` — text
- `publishedYear` — integer
- `description` — editor text
- `cover` — one image file, max 10 MiB
- `location` — text
- `owner` — optional relation to `users`

The `cover` field configures the **`80x120`** thumbnail used by `LibraryScreen` (`?thumb=80x120`).

### `reading_status`

Per-user reading state. Users can only list/view/create/update/delete their own records. There is at most one status record per `(user, book)` pair.

Fields:

- `user` — required relation to `users`
- `book` — required relation to `books`
- `status` — required select: `want_to_read`, `reading`, or `finished`
- `startedAt` — optional date
- `finishedAt` — optional date
- `rating` — optional integer from 1 through 5

### `loans`

Shared household lending history. Authenticated household users may list/view/update/delete loans. New loans must set `lentBy` to the currently authenticated user.

Fields:

- `book` — required relation to `books`
- `lentBy` — required relation to `users`
- `borrowerName` — required text
- `borrowerContact` — optional text
- `dateLent` — required date
- `dateDue` — optional date
- `dateReturned` — optional date
- `notes` — editor text

## Making schema changes

During development, PocketBase can generate migration files for dashboard collection changes when automigrate is enabled. Review generated migrations before committing them. Prefer small forward migrations rather than editing a migration that has already been applied outside disposable development databases.

Before opening a PR, verify a fresh database can apply every committed migration. CI performs this check against the PocketBase version above.
