import { error } from '@sveltejs/kit';
import { ApiError, getTravelCountry } from '#lib/server/vigie.js';
import type { CountryDetail } from '#lib/travel.js';
import type { PageServerLoad } from './$types';

// One country: every ministry's advice in its words (its HTML turned into words by `textBlocks`), the comparison, the
// versions archived by the API and the ECDC's publications that name the country.
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const cc = params.cc.toUpperCase();
	if (!/^[A-Z]{2}$/.test(cc)) error(404, 'Not a country code');

	let detail: CountryDetail | null = null;
	let apiDown = false;
	try {
		const answer = await getTravelCountry(cc);
		if (!answer) error(404, 'Not a country code');
		detail = answer.value;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
		apiDown = true;
	}
	// A code the API knows nothing about (no ministry, no border): not a page.
	if (
		detail &&
		!detail.advices.length &&
		!detail.history.length &&
		!detail.health?.items.length &&
		detail.name === null
	)
		error(404, 'No travel advice for this code');

	setHeaders({ 'cache-control': 'public, max-age=300, s-maxage=600' });
	return { cc, detail, apiDown };
};
