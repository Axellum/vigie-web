// A town of the base map, clicked on the sea map: its name as the map shows it, its place, and the spots nearest to it. Pure
// functions: MapView reads the town under a click, the town's card lists the spots.
import type { Lang } from '../i18n';
import { distanceKm } from '../near';
import type { SeaPin } from './map';

export interface Town {
	name: string;
	lat: number;
	lon: number;
}

/** The kinds of the base map's places that open a card; the countries, regions, suburbs and hamlets do not. */
export const TOWN_CLASSES: readonly string[] = ['city', 'town', 'village'];

/**
 * The town of a name of the base map (OpenMapTiles' `place` layer), from the properties of its feature and its point; null for
 * any other place or a name it does not have. Its name in the page's language when the map has one, as the map writes it.
 */
export function townOf(props: Record<string, unknown>, at: readonly number[], lang: Lang): Town | null {
	if (!TOWN_CLASSES.includes(String(props.class))) return null;
	const text = (key: string) => (typeof props[key] === 'string' && props[key] !== '' ? props[key] : null);
	const name = (lang === 'en' ? text('name_en') : text(`name:${lang}`)) ?? text('name:latin') ?? text('name');
	const [lon, lat] = at;
	if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
	return { name, lat, lon };
}

/** How many spots a town's card lists, and how far from it at most (kilometres, as the crow flies). */
export const NEAREST_SPOTS = 4;
export const NEAREST_MAX_KM = 30;

/** The pins of the spots nearest to the town, nearest first, with their distance. */
export function nearestPins(
	pins: readonly SeaPin[],
	town: Pick<Town, 'lat' | 'lon'>,
	count = NEAREST_SPOTS,
	maxKm = NEAREST_MAX_KM
): { pin: SeaPin; km: number }[] {
	return pins
		.map((pin) => ({ pin, km: distanceKm(town, pin) }))
		.filter((p) => p.km <= maxKm)
		.sort((a, b) => a.km - b.km)
		.slice(0, count);
}
