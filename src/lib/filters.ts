// The fine filters of "what counts" on the home page: families of phenomena, the lowest level, the period and
// the kind of source. They live in the page's address (`?families=wind,coastal&level=orange&period=now&kind=
// official`), so that a filtered view can be kept or shared, and they act in the browser on the world already
// read: a filter never asks the API for anything. A profile is a shortcut to a set of filters. Pure functions.
import { FAMILIES, MIN_IMPACT, type Family, type WorldEvent } from './events';
import { t, type Key, type Lang } from './i18n';
import type { Profile } from './profiles';
import { rank } from './levels';

export const MIN_LEVELS = ['orange', 'red'] as const;
export type MinLevel = (typeof MIN_LEVELS)[number];
export const PERIODS = ['now', '24h'] as const;
export type Period = (typeof PERIODS)[number];
export const KINDS = ['official', 'hazards'] as const;
export type SourceKind = (typeof KINDS)[number];

/** Null or empty means no filter of that sort. */
export interface EventFilter {
	families: Family[];
	level: MinLevel | null;
	period: Period | null;
	kind: SourceKind | null;
}

export const NO_FILTER: EventFilter = { families: [], level: null, period: null, kind: null };

const one = <T extends string>(value: string | null, allowed: readonly T[]): T | null =>
	value && (allowed as readonly string[]).includes(value) ? (value as T) : null;

/** The filters of an address; what the site does not know is no filter, never an error. */
export function parseFilter(params: { get(name: string): string | null }): EventFilter {
	const families = (params.get('families') ?? '')
		.split(',')
		.filter((f): f is Family => (FAMILIES as readonly string[]).includes(f));
	return {
		// In the order of the API's families, once each: one filter, one address.
		families: FAMILIES.filter((f) => families.includes(f)),
		level: one(params.get('level'), MIN_LEVELS),
		period: one(params.get('period'), PERIODS),
		kind: one(params.get('kind'), KINDS)
	};
}

/** The query of an address for these filters ('' for none), in a fixed order. */
export function filterQuery(f: EventFilter): string {
	const params = new URLSearchParams();
	if (f.families.length) params.set('families', FAMILIES.filter((x) => f.families.includes(x)).join(','));
	if (f.level) params.set('level', f.level);
	if (f.period) params.set('period', f.period);
	if (f.kind) params.set('kind', f.kind);
	const query = params.toString().replaceAll('%2C', ',');
	return query ? `?${query}` : '';
}

export function isFiltered(f: EventFilter): boolean {
	return filterQuery(f) !== '';
}

const LOWEST = { orange: 'ORANGE', red: 'RED' } as const;
const DAY_S = 86_400;

/** The events that count (impact 20 and up) and pass the filters, in the API's order. The API answers what is in
 *  force or to come when it was read: an event is not dropped here when its end passes. */
export function applyFilter(events: WorldEvent[], f: EventFilter, now: number): WorldEvent[] {
	return events.filter((e) => {
		if (e.impact < MIN_IMPACT) return false;
		if (f.families.length && !f.families.includes(e.family)) return false;
		if (f.level && rank(e.level) < rank(LOWEST[f.level])) return false;
		if (f.kind === 'official' && e.kind !== 'warnings') return false;
		if (f.kind === 'hazards' && e.kind === 'warnings') return false;
		if (f.period === 'now' && e.start != null && e.start > now) return false;
		if (f.period === '24h' && e.start != null && e.start > now + DAY_S) return false;
		return true;
	});
}

/**
 * What each profile looks at first, as filters. They are shortcuts: the filters stay visible and can be changed.
 * Travel wants everything that is orange or red; home automation what is orange or red now.
 */
export const PROFILE_FILTERS: Record<Profile, EventFilter> = {
	surf: { ...NO_FILTER, families: ['wind', 'coastal', 'cyclone', 'tsunami'] },
	sea: { ...NO_FILTER, families: ['wind', 'thunderstorm', 'fog', 'coastal', 'cyclone', 'tsunami'] },
	mountain: { ...NO_FILTER, families: ['wind', 'rain-flood', 'thunderstorm', 'snow-ice', 'cold'] },
	sky: { ...NO_FILTER, families: ['space'] },
	travel: { ...NO_FILTER, level: 'orange' },
	allergy: { ...NO_FILTER, families: ['heat', 'air'] },
	garden: { ...NO_FILTER, families: ['wind', 'rain-flood', 'thunderstorm', 'snow-ice', 'heat', 'cold'] },
	home: { ...NO_FILTER, level: 'orange', period: 'now' }
};

/** The profile whose shortcut gives exactly these filters, if one does. */
export function profileOf(f: EventFilter): Profile | null {
	const query = filterQuery(f);
	if (!query) return null;
	const found = (Object.keys(PROFILE_FILTERS) as Profile[]).find(
		(p) => filterQuery(PROFILE_FILTERS[p]) === query
	);
	return found ?? null;
}

/** Below orange an event is folded at first, behind one line that says how many: the list opens on orange and red. */
export function folded(e: WorldEvent): boolean {
	return rank(e.level) < rank('ORANGE');
}

/** What the folded line says: "52 en jaune · 1 en vert · 3 sans niveau". */
export function foldedSummary(lang: Lang, events: WorldEvent[]): string {
	const n = (level: WorldEvent['level']) => events.filter((e) => e.level === level).length;
	const parts: [number, Key][] = [
		[n('YELLOW'), 'point.foldYellow'],
		[n('GREEN'), 'point.foldGreen'],
		[n(null), 'point.foldNone']
	];
	return parts
		.filter(([count]) => count > 0)
		.map(([count, key]) => t(lang, key, { n: count }))
		.join(' · ');
}
