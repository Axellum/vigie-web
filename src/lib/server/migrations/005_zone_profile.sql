-- The profile of a zone (src/lib/profiles.ts): what matters first there, the sea for a surfer, the sky for a
-- stargazer. It only orders the cards of "near me"; the notifications keep the zone's own rules (lowest level,
-- kinds of alert). Null when none was chosen.
alter table zones add column profile text
	check (profile in ('surf', 'sea', 'mountain', 'sky', 'travel', 'allergy', 'garden', 'home'));
