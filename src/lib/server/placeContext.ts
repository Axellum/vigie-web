// What every page that shows the cards of a place loads on the server, the same for everybody: the hazards, the
// countries that have official warnings, and why the others have none. The place itself is never here: the browser
// matches it against this (src/lib/placeState.svelte.ts).
import type { Hazard, UncoveredCountry } from '#lib/types.js';
import { ApiError, getHazards, getUncovered, servedCodes } from './vigie';

export interface PlaceContext {
	hazards: Hazard[];
	hazardsAttribution: string | null;
	served: string[];
	uncovered: UncoveredCountry[];
	apiDown: boolean;
	now: number;
}

export async function placeContext(): Promise<PlaceContext> {
	let hazards: Hazard[] = [];
	let hazardsAttribution: string | null = null;
	let apiDown = false;
	try {
		const { value } = await getHazards();
		hazards = value.items;
		hazardsAttribution = value.attribution;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
		apiDown = true;
	}
	const served = await servedCodes();
	// Why a country has no source, as the API says it (none when it cannot tell).
	let uncovered: UncoveredCountry[] = [];
	try {
		uncovered = (await getUncovered()).value;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
	}
	return { hazards, hazardsAttribution, served, uncovered, apiDown, now: Math.floor(Date.now() / 1000) };
}
