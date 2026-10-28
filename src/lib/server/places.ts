// The places that can be searched by name, read once from data/places.tsv.gz (GeoNames, CC BY 4.0;
// scripts/build-places.mjs) on the first search, then kept in memory (about 236,000 places).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { VIGIE_PLACES_FILE } from '$app/env/private';
import { countryName } from '$lib/i18n';
import { parsePlaceLine, searchPlaces, type PlaceEntry, type PlaceMatch } from '$lib/places';

let entries: PlaceEntry[] | null = null;
let unavailable = false;

function load(): PlaceEntry[] | null {
	if (entries || unavailable) return entries;
	try {
		const file = resolve(VIGIE_PLACES_FILE || 'data/places.tsv.gz');

		entries = gunzipSync(readFileSync(file)).toString('utf-8').split('\n').map(parsePlaceLine).filter((e): e is PlaceEntry => e !== null);
	} catch(error) {
		console.error(`Place search is off: ${(error as Error).message}`);
		unavailable = true;
	}
	return entries;
}

const names = new Map<string, string[]>();
function countryNames(cc: string): string[] {
	let list = names.get(cc);
	if (!list) {
		list = [countryName('fr', cc), countryName('en', cc)];
		names.set(cc, list);
	}
	return list;
}

/** The places matching a query; null when the places file could not be read. */
export function findPlaces(query: string): PlaceMatch[] | null {
	const list = load();
	return list ? searchPlaces(list, query.slice(0, 80), countryNames) : null;
}
