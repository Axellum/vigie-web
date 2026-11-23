-- Rolls back 010_app_links: the codes waiting go, and the phones linked by a code stay devices of their account
-- (they still get its alerts) but lose their own secret. Take a dump first (deploy/vps/backup.sh) and run it by hand:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f src/lib/server/migrations/down/010_app_links.down.sql
-- The site then runs the previous version, which does not know these codes.
alter table push_subscriptions drop column if exists app_secret_hash;
drop table if exists app_link_codes;
delete from schema_migrations where id = '010_app_links';
