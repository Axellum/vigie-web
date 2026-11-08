import { parseSetup, panelChoice, tvPath, type TvSetup, type PanelChoice } from '#lib/tv/address.js';
import { publicOrigin } from '#lib/server/origin.js';
import { ApiError, getSurfSpots } from '#lib/server/vigie.js';
import type { PageServerLoad } from './$types';

export interface ScreensData {
	setup: TvSetup;
	panels: PanelChoice;
	/** The places to choose from; empty when the API does not answer (the page then asks for the id). */
	spots: { id: string; label: string }[];
	/** The path of the screen (`/tv?...`), or null while no place is chosen. */
	path: string | null;
	/** The whole address, for the person to copy and type on the television. */
	address: string | null;
}

// The page that sets a screen up: it only turns choices, sent in its own address, into the address of the screen. Nothing is kept.
export const load: PageServerLoad = async ({ url, locals }): Promise<ScreensData> => {
	const setup = parseSetup(url.searchParams, locals.lang);
	let spots: ScreensData['spots'] = [];
	try {
		const listed = await getSurfSpots();
		spots = listed.value.spots
			.map((s) => ({ id: s.id, label: s.place ? `${s.place} · ${s.name}` : s.name }))
			.sort((a, b) => a.label.localeCompare(b.label, locals.lang));
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
	}
	// A place the API does not know is no place: the screen would only say so.
	if (spots.length && setup.params.spot && !spots.some((s) => s.id === setup.params.spot))
		setup.params.spot = null;
	const path = tvPath(setup);
	return {
		setup,
		panels: panelChoice(setup.params),
		spots,
		path,
		address: path ? `${publicOrigin()}${path}` : null
	};
};
