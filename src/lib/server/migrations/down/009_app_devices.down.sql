-- Rolls back 009_app_devices: the devices of the app go, with their places and what they were told; the zones and
-- history of the accounts stay. Take a dump first (deploy/vps/backup.sh) and run it by hand:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f src/lib/server/migrations/down/009_app_devices.down.sql
-- The site then runs the previous version, which does not know these devices.
delete from zone_alerts where device_id is not null;
alter table zone_alerts drop column if exists device_id;
alter table zone_alerts alter column user_id set not null;
delete from zones where device_id is not null;
alter table zones drop constraint if exists zones_one_owner;
drop index if exists zones_device;
alter table zones drop column if exists device_id;
alter table zones alter column user_id set not null;
drop table if exists app_devices;
delete from schema_migrations where id = '009_app_devices';
