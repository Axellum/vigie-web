// The world in events (`GET /v1/events`, compact): what the API groups (the warnings of one phenomenon close
// together, an earthquake sequence, one hazard) and ranks by its impact score. The grouping, the score, the level
// of an event and its title are the API's or the site's own work, never an official word: the page says so. The
// title is written here in the reader's language from the family, the country and the areas; a hazard keeps
// its source's own title, taken from the hazards the site reads anyway. Pure functions.
import { countryName, t, tOr, type Key, type Lang } from './i18n';
import { rank } from './levels';
import type { Hazard, Level } from './types';

export const FAMILIES = [
	'wind',
	'rain-flood',
	'thunderstorm',
	'snow-ice',
	'heat',
	'cold',
	'fog',
	'fire',
	'coastal',
	'earthquake',
	'volcano',
	'cyclone',
	'tsunami',
	'air',
	'space',
	'other'
] as const;
export type Family = (typeof FAMILIES)[number];

export interface WorldEvent {
	id: string;
	/** `warnings` (official warnings grouped), `earthquakes` (a sequence), `tsunami`, `hazard` (any other). */
	kind: string;
	family: Family;
	/** The API's hazard category (EARTHQUAKE, HURRICANE…) when the event is one; null for warnings. */
	category: string | null;
	/** 0 to 100, the API's rank: not a probability, not an official level. */
	impact: number;
	level: Level | null;
	country: string | null;
	areasCount: number | null;
	/** The names of the areas, as the sources give them (the first few). */
	areaNames: string[];
	start: number | null;
	end: number | null;
	/** [west, south, east, north]. */
	bbox: [number, number, number, number] | null;
	sources: string[];
	/** How many earthquakes make a sequence, as the API counts them; null for anything else. */
	quakes: number | null;
	attribution: string | null;
}

export interface WorldEvents {
	events: WorldEvent[];
	/** Events by level, as the API counts them; the green ones are left out of the counters of the page. */
	counts: { RED: number; ORANGE: number; YELLOW: number; GREEN: number; unknown: number };
	/** The sources that did not answer, with their country: their warnings are missing, which is not "nothing". */
	missing: { source: string; country: string | null }[];
	attribution: string | null;
	disclaimer: string | null;
	generated: number | null;
}

/** The events a page lists by default: official yellow and up, and every hazard the API rates (impact 20 and up). */
export const MIN_IMPACT = 20;
const MAX_AREA_NAMES = 6;

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const LEVELS = ['RED', 'ORANGE', 'YELLOW', 'GREEN'];
const asLevel = (v: unknown): Level | null => (LEVELS.includes(v as string) ? (v as Level) : null);
const asFamily = (v: unknown): Family =>
	(FAMILIES as readonly unknown[]).includes(v) ? (v as Family) : 'other';

function bboxOf(v: unknown): WorldEvent['bbox'] {
	if (!Array.isArray(v) || v.length !== 4 || !v.every((x) => typeof x === 'number' && Number.isFinite(x)))
		return null;
	return v as [number, number, number, number];
}

/** The size of an earthquake sequence, from the API's reasons ("7 earthquakes in the sequence"); null without it. */
function quakesOf(reasons: unknown): number | null {
	if (!Array.isArray(reasons)) return null;
	for (const r of reasons) {
		const m = typeof r === 'string' ? /^(\d+) earthquakes in the sequence$/.exec(r) : null;
		if (m) return Number(m[1]);
	}
	return null;
}

export function eventsFromApi(raw: unknown): WorldEvents {
	const body = (raw ?? {}) as Json;
	const list = Array.isArray(body.events) ? (body.events as Json[]) : [];
	const events: WorldEvent[] = list.map((e) => ({
		id: String(e.id),
		kind: str(e.kind) ?? 'hazard',
		family: asFamily(e.family),
		category: str(e.category),
		impact: num(e.impact) ?? 0,
		level: asLevel(e.level),
		country: str(e.country)?.toUpperCase() ?? null,
		areasCount: num(e.areas_count),
		areaNames: (Array.isArray(e.area_names) ? e.area_names : [])
			.filter((n): n is string => typeof n === 'string' && n !== '')
			.slice(0, MAX_AREA_NAMES),
		start: num(e.start_utc),
		end: num(e.end_utc),
		bbox: bboxOf(e.bbox),
		sources: (Array.isArray(e.sources) ? e.sources : []).filter((s): s is string => typeof s === 'string'),
		quakes: quakesOf(e.impact_reasons),
		attribution: str(e.attribution)
	}));
	// The API sends the strongest first; the page relies on it, so it is kept even if an answer came unsorted.
	events.sort((a, b) => b.impact - a.impact || rank(b.level) - rank(a.level));
	const byLevel = ((body.counts as Json | undefined)?.by_level ?? {}) as Json;
	const count = (k: string) => num(byLevel[k]) ?? 0;
	const coverage = Array.isArray(body.coverage) ? (body.coverage as Json[]) : [];
	return {
		events,
		counts: {
			RED: count('RED'),
			ORANGE: count('ORANGE'),
			YELLOW: count('YELLOW'),
			GREEN: count('GREEN'),
			unknown: count('unknown')
		},
		missing: coverage
			.filter((c) => str(c.status) && c.status !== 'ok')
			.map((c) => ({ source: String(c.source), country: str(c.country) })),
		attribution: str(body.attribution),
		disclaimer: str(body.disclaimer),
		generated: num(body.server_utc)
	};
}

const EPS = 0.01;

/** The hazards the site reads that make an event (same category, inside its box), the strongest first. */
export function hazardsOf(event: WorldEvent, hazards: Hazard[]): Hazard[] {
	const box = event.bbox;
	if (!event.category || !box) return [];
	return hazards
		.filter(
			(h) =>
				h.category === event.category &&
				h.lon >= box[0] - EPS &&
				h.lon <= box[2] + EPS &&
				h.lat >= box[1] - EPS &&
				h.lat <= box[3] + EPS
		)
		.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity) || rank(b.level) - rank(a.level));
}

/** The site's label of a family, in the reader's language. */
export function familyLabel(lang: Lang, family: Family): string {
	return t(lang, `family.${family}` as Key);
}

/**
 * The title of an event in the reader's language. Warnings: the family, the country, the area when there is
 * one, else how many. A hazard: its source's own title when the site reads it, else its kind.
 */
export function eventTitle(lang: Lang, event: WorldEvent, hazards: Hazard[]): string {
	if (event.kind === 'warnings') {
		const parts = [familyLabel(lang, event.family)];
		if (event.country) parts.push(countryName(lang, event.country));
		if (event.areasCount === 1 && event.areaNames[0]) parts.push(event.areaNames[0]);
		else if (event.areasCount) parts.push(t(lang, 'point.areas', { n: event.areasCount }));
		return parts.join(' · ');
	}
	const own = hazardsOf(event, hazards)[0];
	const kind = event.category ? tOr(lang, `cat1.${event.category}`, familyLabel(lang, event.family)) : null;
	// Without the hazard itself (the site reads the hazards a little apart), its kind and its country.
	const head =
		own?.title ??
		[
			kind ?? familyLabel(lang, event.family),
			...(event.country ? [countryName(lang, event.country)] : [])
		].join(' · ');
	return event.quakes && event.quakes > 1
		? `${head} · ${t(lang, 'point.quakes', { n: event.quakes })}`
		: head;
}

/** "The point" of the world in two sentences: what is red, then how many orange and yellow. */
export function worldSentence(lang: Lang, world: WorldEvents, hazards: Hazard[]): string[] {
	const red = world.events.filter((e) => e.level === 'RED');
	const names = red.slice(0, 3).map((e) => eventTitle(lang, e, hazards));
	const more = red.length > 3 ? ` (+${red.length - 3})` : '';
	const first = red.length
		? t(lang, 'point.red', { n: red.length, names: names.join(' ; ') + more })
		: t(lang, 'point.noRed');
	return [first, t(lang, 'point.others', { orange: world.counts.ORANGE, yellow: world.counts.YELLOW })];
}
