import { error, fail, redirect } from '@sveltejs/kit';
import { sessionUser } from '$lib/server/accounts';
import { accountsEnabled, db } from '$lib/server/db';
import { servedCodes } from '$lib/server/vigie';
import { addZone, listZones, ZoneError } from '$lib/server/zones';
import { MAX_ZONES, parseZone } from '$lib/zones';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, url, setHeaders }) => {
	if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
	setHeaders({ 'cache-control': 'private, no-store' });
	const sql = await db();
	const user = await sessionUser(sql, cookies, url.protocol === 'https:');
	if (!user) redirect(303, '/login');
	const country = url.searchParams.get('country')?.toUpperCase() ?? null;
	return {
		count: (await listZones(sql, user.id)).length,
		max: MAX_ZONES,
		served: await servedCodes(),
		country: country && /^[A-Z]{2}$/.test(country) ? country : null,
		area: url.searchParams.get('area')
	};
};

export const actions: Actions = {
	default: async ({ cookies, url, request }) => {
		if (!accountsEnabled()) error(404);
		const sql = await db();
		const user = await sessionUser(sql, cookies, url.protocol === 'https:');
		if (!user) redirect(303, '/login');
		const parsed = parseZone(await request.formData());
		if (!parsed.ok) return fail(400, { error: parsed.error });
		try {
			await addZone(sql, user.id, parsed.zone);
		} catch (e) {
			if (e instanceof ZoneError) return fail(400, { error: e.code });
			throw e;
		}
		redirect(303, '/account#zones');
	}
};
