-- Rolls back 006_personal_page: drops the places, the pages, their private links and the preferences. It deletes
-- what people kept there, so take a dump first (deploy/vps/backup.sh) and run it by hand:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f src/lib/server/migrations/down/006_personal_page.down.sql
-- The site then runs the previous version, which does not know these tables.
drop table if exists page_links;
drop table if exists pages;
drop table if exists places;
alter table users drop column if exists prefs;
delete from schema_migrations where id = '006_personal_page';
