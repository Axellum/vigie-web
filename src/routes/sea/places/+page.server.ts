import { isPlaceType, MAX_Q, type PlaceType, type SeaPlaceList } from '#lib/sea/places.js';
import { ApiError, getSeaPlaces } from '#lib/server/vigie.js';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 24;

// The catalogue of the places of the coast: a kind (`?type=port`), some words (`?q=malo`) and a page, read by the server so that
// the list works without a script; "around my position" is the browser's, which asks `/data/sea-places.json`. Without a kind or
// words the page shows only the count of each kind: a list of four thousand places is not an answer to anything. The catalogue
// is a file of the API, the same for everybody: the page is kept by the proxy.
export const load: PageServerLoad = async ({ url, setHeaders }) => {
	const rawType = url.searchParams.get('type');
	const type: PlaceType | null = isPlaceType(rawType) ? rawType : null;
	const q = (url.searchParams.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_Q).trim();
	const asked = Number(url.searchParams.get('page'));
	const page = Number.isInteger(asked) && asked >= 1 && asked <= 1000 ? asked : 1;
	const browsing = type != null || q !== '';

	let list: SeaPlaceList | null = null;
	let failed = false;
	try {
		// Without a kind or words one place is read: the answer holds the count of each kind, which is all the page shows.
		const read = await getSeaPlaces({
			types: type ? [type] : [],
			q,
			limit: browsing ? PAGE_SIZE : 1,
			offset: browsing ? (page - 1) * PAGE_SIZE : 0
		});
		list = read.value;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
		failed = true;
	}
	setHeaders({
		'cache-control': failed ? 'public, max-age=60, s-maxage=60' : 'public, max-age=300, s-maxage=600'
	});
	return { type, q, page, pageSize: PAGE_SIZE, browsing, list, failed };
};
