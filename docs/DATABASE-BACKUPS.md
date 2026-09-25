# Automated Supabase database backups

This repository includes a daily GitHub Actions workflow at `.github/workflows/backup.yml`. It follows Supabase's CLI backup pattern and stores each day's compressed role, schema, and data dumps in `backups/supabase/YYYY-MM-DD/` on the separate `database-backups` branch. Keeping dumps off `main` avoids triggering the production website deployment for each backup.

The workflow is intentionally off until `BACKUP_ENABLED` is set to `true`. It runs daily at 02:00 India Standard Time and can also be started manually from GitHub Actions. It refuses to run if the repository is public. Only scheduled and manual runs on `main` can access the database secret; it does not run for pull requests.

The dump step runs from a minimal temporary Supabase project config, not the app's local config. This keeps local-only settings from preventing the remote database backup. The `database-backups` branch contains only dated database snapshots, not a duplicate copy of the application. When converting an older branch that contains project files, prior successful snapshots are moved into date folders before the branch history is cleaned.

Automated backup commits use Cloudflare Pages' `[CF-Pages-Skip]` prefix so database-only changes do not trigger website preview builds.

Each roles, schema, and data dump is logged as a separate stage with its start time, duration, CLI output, and exit status. If one fails, the workflow prints its captured output with connection passwords redacted.

## One-time GitHub setup

1. Confirm the GitHub repository visibility is **Private**. Backups can contain customer email addresses, order and wallet history, security logs, and other personal data. Everyone with repository read access can access these backups. Keep repository access limited and protected with two-factor authentication.
2. In the repository, open **Settings → Actions → General → Workflow permissions**. Select **Read and write permissions** and save. The workflow also requests only `contents: write` for the backup job so it can commit the generated files.
3. In **Settings → Secrets and variables → Actions → Secrets**, add `SUPABASE_DB_URL`. Use the production project's **Session pooler** connection string from Supabase → Connect. Keep the full string, including the password, in the secret; percent-encode special characters in the password as required for a URL. Never put it in this repository, workflow YAML, a log, or a chat message.
4. In **Settings → Secrets and variables → Actions → Variables**, add `BACKUP_ENABLED` with the value `true`. Leave it unset or set it to `false` to disable scheduled backups.
5. Open **Actions → Supabase database backup → Run workflow** and run it on `main`. Confirm that it completes and that the `database-backups` branch contains a date folder with `roles.sql.gz`, `schema.sql.gz`, `data.sql.gz`, `manifest.txt`, and `SHA256SUMS`.
6. Confirm the next scheduled run succeeds. GitHub may delay scheduled workflows during busy periods, so monitor the Actions page and investigate failed or missing runs.

The connection secret needs database access. If you rotate the Supabase database password, update `SUPABASE_DB_URL` immediately. The workflow can be paused quickly by setting `BACKUP_ENABLED` to `false`.

## What is and is not backed up

The workflow uses Supabase's recommended `supabase db dump` commands for roles, schema, and data. Supabase CLI deliberately excludes platform-managed schemas such as `auth` and `storage`, as well as extension-managed schemas. That means this workflow backs up the app-owned database objects/data but does **not** back up Auth users/password credentials, Storage objects (uploaded files), Supabase Auth/provider settings, API keys, project secrets, Edge Functions, or other project configuration. Keep schema changes in the checked-in migrations and separately document/configure platform settings.

This is a useful free logical backup of application tables, not a complete replacement for Supabase's managed backups/PITR or a full project clone. If preserving customer login accounts and uploaded support files is required for disaster recovery, this workflow alone is insufficient. Use a supported full-project backup/restore option or design and test a separate Auth/Storage recovery process before relying on it.

The dump files are compressed but not separately encrypted by this workflow. Repository privacy and access control are therefore critical. Each date folder is retained in the backup branch and in its commit history, so repository storage grows over time. Review repository storage and Actions usage periodically. Do not make this repository public or add unknown collaborators.

## Restore test

Do not test restoration over the live project. Restore to a separate disposable Supabase project and verify row counts, constraints, policies, triggers, functions, indexes, and representative wallet/order records before considering the backup usable.

For a specific day's snapshot, download that date's folder, for example `backups/supabase/2026-09-25/`. From the downloaded folder, decompress and verify the files:

```bash
gzip -dc roles.sql.gz > roles.sql
gzip -dc schema.sql.gz > schema.sql
gzip -dc data.sql.gz > data.sql
sha256sum --check SHA256SUMS
```

After creating a separate target Supabase project and obtaining its connection string, use Supabase's current restore guidance. The documented sequence restores roles and schema, then data in a single transaction while suppressing triggers for the data load:

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$NEW_DB_URL"
```

Supabase may require adjustments for managed-role grants, extensions, privileges, or project-specific settings. Follow the [official backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), review errors carefully, and test the restored app against the disposable project. Do not assume a successful SQL restore also restores authentication or storage files.

## References

- [Supabase: Automated backups using GitHub Actions](https://supabase.com/docs/guides/deployment/ci/backups)
- [Supabase: Backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase CLI `db dump` reference](https://supabase.com/docs/reference/cli/supabase-db-dump)
