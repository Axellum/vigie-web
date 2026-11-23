// What every page that shows the cards of a place loads on the server, the same for everybody: the hazards, the
// countries that have official warnings, and why the others have none. The place itself is never here: the browser
// matches it against this (src/lib/placeState.svelte.ts).
import type { Hazard, UncoveredCountry } from '#lib/types.js';
import { ApiError, getHazards, getUncovered, servedCodes } from './vigie';

export interface PlaceContext {
	hazards: Hazard[];
	hazardsAttribution: string | null;
	hazardsDisclaimer: string | null;
	served: string[];
	uncovered: UncoveredCountry[];
	apiDown: boolean;
	now: number;
}

export async function placeContext(): Promise<PlaceContext> {
	let hazards: Hazard[] = [];
	let hazardsAttribution: string | null = null;
	let hazardsDisclaimer: string | null = null;
	let apiDown = false;
	let uncovered: UncoveredCountry[] = [];
	// The three calls do not depend on each other: they go together. An API that does not answer is handled for
	// the hazards and for the reasons (the page says so); any other error goes up, as before.
	const [hazardsResult, served, uncoveredResult] = await Promise.all([
		getHazards().catch((e: unknown) => {
			if (!(e instanceof ApiError)) throw e;
			return null;
		}),
		servedCodes(),
		// Why a country has no source, as the API says it (none when it cannot tell).
		getUncovered().catch((e: unknown) => {
			if (!(e instanceof ApiError)) throw e;
			return null;
		})
	]);
	if (hazardsResult) {
		hazards = hazardsResult.value.items;
		hazardsAttribution = hazardsResult.value.attribution;
		hazardsDisclaimer = hazardsResult.value.disclaimer;
	} else apiDown = true;
	if (uncoveredResult) uncovered = uncoveredResult.value;
	return {
		hazards,
		hazardsAttribution,
		hazardsDisclaimer,
		served,
		uncovered,
		apiDown,
		now: Math.floor(Date.now() / 1000)
	};
}
