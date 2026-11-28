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

const KM_PER_DEGREE = 111.2;

/** How much farther than the nearest place a more populated one may be and still name the point. */
const NAMING_SLACK_KM = 1.5;

/** Beyond this, no place names a point (the open sea, an empty land). */
export const NAMING_MAX_KM = 25;

/**
 * The place that names a point, for the Android app's place "Ici" that follows the phone: among the places
 * within 1.5 km of the nearest one, the most populated, so that a city wins over its districts ("Paris"
 * rather than "Paris 04 Hôtel-de-Ville", "Marseille" rather than "Belsunce"); null when no place is within
 * 25 km. A flat distance is enough at that range.
 */
export function nearestPlace(entries: PlaceEntry[], lat: number, lon: number): PlaceMatch | null {
	const shrink = Math.cos((lat * Math.PI) / 180);
	const near: { entry: PlaceEntry; km: number }[] = [];
	let nearest = Infinity;
	for (const entry of entries) {
		const dLat = entry.lat - lat;
		if (Math.abs(dLat) * KM_PER_DEGREE > NAMING_MAX_KM) continue;
		let dLon = Math.abs(entry.lon - lon);
		if (dLon > 180) dLon = 360 - dLon;
		const km = Math.hypot(dLat, dLon * shrink) * KM_PER_DEGREE;
		if (km > NAMING_MAX_KM) continue;
		near.push({ entry, km });
		nearest = Math.min(nearest, km);
	}
	let best: { entry: PlaceEntry; km: number } | null = null;
	for (const n of near) {
		if (n.km > nearest + NAMING_SLACK_KM) continue;
		const people = n.entry.population ?? 0;
		const bestPeople = best?.entry.population ?? 0;
		if (!best || people > bestPeople || (people === bestPeople && n.km < best.km)) best = n;
	}
	if (!best) return null;
	const { keys: _keys, ...match } = best.entry;
	return match;
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
