// Search of the places by name (GeoNames). Pure functions: the server reads the file and keeps the list.

export interface PlaceMatch {
	name: string;
	region: string | null;
	cc: string;
	lat: number;
	lon: number;
	population: number | null;
}

export interface PlaceEntry extends PlaceMatch {
	/** The name and the other names, folded (`fold`). */
	keys: string[];
}

export const PLACES_ATTRIBUTION = 'Places: GeoNames (https://www.geonames.org/), CC BY 4.0';

/** Lowercase, without accents, apostrophes and dashes made plain, spaces squeezed. */
export function fold(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[’‘`]/g, "'")
		.replace(/[-‐‑–]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** One line of `data/places.tsv.gz` (scripts/build-places.mjs); null when it cannot be read. */
export function parsePlaceLine(line: string): PlaceEntry | null {
	const [name, others, cc, region, lat, lon, population] = line.split('\t');
	const la = Number(lat),
		lo = Number(lon);
	if (!name || !cc || !Number.isFinite(la) || !Number.isFinite(lo)) return null;
	const keys = [...new Set([name, ...(others ? others.split('|') : [])].map(fold))];
	const pop = Number(population);
	return {
		name,
		region: region || null,
		cc,
		lat: la,
		lon: lo,
		population: Number.isFinite(pop) && pop > 0 ? pop : null,
		keys
	};
}

/**
 * The places whose name (or another name) matches the query: the same name first, then a name that starts
 * with it, then a word of the name that starts with it; the most populated first within each. "Paris,
 * Texas" or "Paris, US" keeps the places whose region or country matches the part after the comma.
 */
export function searchPlaces(
	entries: PlaceEntry[],
	query: string,
	countryNames: (cc: string) => string[] = () => [],
	limit = 8
): PlaceMatch[] {
	const [rawName, rawWhere = ''] = query.split(',', 2);
	const q = fold(rawName);
	const where = fold(rawWhere);
	if (q.length < 2) return [];
	const scored: { entry: PlaceEntry; score: number }[] = [];
	for (const entry of entries) {
		let score = 0;
		for (const key of entry.keys) {
			if (key === q) score = Math.max(score, 3);
			else if (key.startsWith(q)) score = Math.max(score, 2);
			else if (key.includes(' ' + q)) score = Math.max(score, 1);
			if (score === 3) break;
		}
		if (score === 0) continue;
		if (where) {
			const places = [entry.cc.toLowerCase(), fold(entry.region ?? ''), ...countryNames(entry.cc).map(fold)];
			if (!places.some((p) => p && p.startsWith(where))) continue;
		}
		scored.push({ entry, score });
	}
	scored.sort((a, b) => b.score - a.score || (b.entry.population ?? 0) - (a.entry.population ?? 0));
	const out: PlaceMatch[] = [];
	const seen = new Set<string>();
	for (const { entry } of scored) {
		const key = `${entry.name}|${entry.region}|${entry.cc}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const { keys: _keys, ...match } = entry;
		out.push(match);
		if (out.length >= limit) break;
	}
	return out;
}
