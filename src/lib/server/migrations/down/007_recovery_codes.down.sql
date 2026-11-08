-- Rolls back 007_recovery_codes: drops the recovery codes. People who kept codes can no longer use them (they still
-- sign in with their passkeys), so take a dump first (deploy/vps/backup.sh) and run it by hand:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f src/lib/server/migrations/down/007_recovery_codes.down.sql
-- The site then runs the previous version, which does not know this table.
drop table if exists recovery_codes;
delete from schema_migrations where id = '007_recovery_codes';
