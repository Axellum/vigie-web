-- The devices of the Android app: they receive the notifications through Firebase Cloud Messaging (FCM), with
-- a registration token instead of a Web Push address and keys. One table for both kinds, so that the limit of
-- devices per account, the list on the account page and the removal stay the same.
alter table push_subscriptions alter column endpoint drop not null;
alter table push_subscriptions alter column p256dh drop not null;
alter table push_subscriptions alter column auth drop not null;
alter table push_subscriptions add column fcm_token text unique;
alter table push_subscriptions add constraint push_subscriptions_one_kind check (
	(endpoint is not null and p256dh is not null and auth is not null and fcm_token is null)
	or (endpoint is null and p256dh is null and auth is null and fcm_token is not null)
);
