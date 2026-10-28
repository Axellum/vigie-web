import { error, json } from '@sveltejs/kit';
import { sessionUser } from '#lib/server/accounts.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { listZones, setZoneProfile, ZoneError } from '#lib/server/zones.js';
import { asProfile } from '#lib/profiles.js';
import type { AccountPlace } from '#lib/followed.js';
import type { RequestHandler } from './$types';

// The places of the account signed in (its zones that are a point and a radius), for "near me". The page stays
// the same for everybody and cacheable: it asks for them from the browser, and this answer is never cached.
// Without a session the answer is an empty list, not an error, so that a visitor's console stays clean.
const PRIVATE = { 'cache-control': 'private, no-store' };

export const GET: RequestHandler = async ({ cookies, url }) => {
	if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
	const sql = await db();
	const user = await sessionUser(sql, cookies, url.protocol === 'https:');
	if (!user) return json({ signedIn: false, places: [] }, { headers: PRIVATE });
	const places: AccountPlace[] = (await listZones(sql, user.id)).flatMap((z) =>
		z.kind === 'circle' && z.lat != null && z.lon != null && z.radiusKm != null
			? [{ id: z.id, name: z.name, lat: z.lat, lon: z.lon, radiusKm: z.radiusKm, profile: z.profile }]
			: []
	);
	return json({ signedIn: true, places }, { headers: PRIVATE });
};

/** Sets the profile of one of these places: `{ id, profile }`, a null profile for none. */
export const POST: RequestHandler = async ({ cookies, url, request }) => {
	if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
	const sql = await db();
	const user = await sessionUser(sql, cookies, url.protocol === 'https:');
	if (!user) error(401, 'Not signed in');
	const body = (await request.json().catch(() => null)) as { id?: unknown; profile?: unknown } | null;
	if (typeof body?.id !== 'string' || (body.profile !== null && !asProfile(body.profile)))
		error(400, 'A zone and a known profile');
	try {
		await setZoneProfile(sql, user.id, body.id, asProfile(body.profile));
	} catch (e) {
		if (e instanceof ZoneError) error(404, 'No such zone');
		throw e;
	}
	return json({ ok: true }, { headers: PRIVATE });
};
