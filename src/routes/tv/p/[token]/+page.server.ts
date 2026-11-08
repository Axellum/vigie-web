import { error } from '@sveltejs/kit';
import { version } from '$app/env';
import { accountsEnabled, db } from '#lib/server/db.js';
import { readSharedPage, type SharedPage } from '#lib/server/pageLinks.js';
import { readBlocks } from '#lib/server/tvShared.js';
import { parseTvParams, type TvParams } from '#lib/tv/params.js';
import { buildShared, clockAt, drawnBlocks, type SharedScreen } from '#lib/tv/shared.js';
import type { Lang } from '#lib/i18n.js';
import type { PageServerLoad } from './$types';

export interface SharedTvData {
	mode: 'screen' | 'empty';
	params: TvParams;
	build: string;
	lang: Lang;
	screen: SharedScreen | null;
	/** When the data were read, as a time of day at the place: `11:06`. */
	freshLabel: string | null;
}

// The screen of a personal page, opened by its private link (ADR 0020 of vigie-api). The secret is the last part of the address and
// is given to the reader of `pageLinks.ts` and to nothing else: it is not written to a log, an error, the title or any attribute of
// the page. The headers of an address that holds a secret (no referrer, no cache, no index) are set by the hooks of the site, not here.
//
//   - an address that is badly formed, unknown or revoked answers 404 with the words of any other 404 (a revoked link cannot be told
//     from one that never existed);
//   - a database that does not answer is 503, not 404: the screen that was showing keeps its last value and says it is offline;
//   - a page with nothing a screen can draw (the home alone, or cards a screen does not show yet) is a message, not an error.
export const load: PageServerLoad = async ({ params, url }): Promise<SharedTvData> => {
	if (!accountsEnabled()) error(404, 'Not Found');
	const tv = parseTvParams(url.searchParams);

	let page: SharedPage | null;
	try {
		page = await readSharedPage(await db(), params.token);
	} catch {
		// No detail: nothing of the request goes to the log, and the error of the database has nothing the screen needs.
		console.error('tv: a personal page could not be read (the database did not answer)');
		error(503, 'The page cannot be read right now');
	}
	if (!page) error(404, 'Not Found');

	const base = { params: tv, build: version, lang: page.lang };
	if (drawnBlocks(page).length === 0) return { ...base, mode: 'empty', screen: null, freshLabel: null };

	const screen = buildShared({
		now: Math.floor(Date.now() / 1000),
		lang: page.lang,
		params: tv,
		page,
		readings: await readBlocks(page)
	});
	return {
		...base,
		mode: 'screen',
		screen,
		freshLabel: screen.fresh != null && screen.offsetS != null ? clockAt(screen.fresh, screen.offsetS) : null
	};
};
