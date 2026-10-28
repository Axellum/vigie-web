import { error } from '@sveltejs/kit';
import { ApiError, getForecast, getHazards, getTsunamiWarnings } from '#lib/server/vigie.js';
import type { HazardForecast, WarningDetail } from '#lib/types.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	let items;
	try {
		items = (await getHazards()).value.items;
	} catch (e) {
		if (e instanceof ApiError) error(502, 'The Vigie API does not answer for now');
		throw e;
	}
	const hazard = items.find((h) => h.id === params.id);
	if (!hazard) error(404, 'This alert is not in the current list any more');

	// A storm's or a tsunami's forecast, and the official messages a tsunami's forecast comes from. Either can
	// fail without the page failing: the hazard is still shown.
	let forecast: HazardForecast | null = null;
	let messages: WarningDetail[] = [];
	if (hazard.hasForecast) {
		try {
			forecast = (await getForecast(hazard.id))?.value ?? null;
			if (forecast?.messages.length) {
				const wanted = new Set(forecast.messages);
				const details = (await getTsunamiWarnings()).value.details;
				messages = [...details.values()].filter((d) => wanted.has(d.identifier));
			}
		} catch (e) {
			if (!(e instanceof ApiError)) throw e;
		}
	}
	setHeaders({ 'cache-control': 'public, max-age=30, s-maxage=60' });
	return { hazard, forecast, messages, now: Math.floor(Date.now() / 1000) };
};
