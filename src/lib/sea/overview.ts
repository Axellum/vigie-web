// "Should you go?" for every spot at once (vigie-api `GET /v1/activities/overview`, ADR 0016 of the API): the headline of the four
// activities of each spot (the best verdict of the daylight hours of the next 24 hours, why it is not good, its best slot) and the
// verdict of the current hour. The verdicts are the API's, rules of Vigie; this file only reads them and puts them in order. What
// the API did not give is left out, never guessed; nothing here is for safety.
import { ACTIVITY_IDS, type ActivityId, type Verdict } from '../activities';
import { distanceKm } from '../near';

const VERDICTS: Verdict[] = ['good', 'possible', 'poor'];

export interface SeaActivity {
	id: ActivityId;
	/** False where the activity cannot be judged here (no tide model near, for shore fishing). */
	available: boolean;
	verdict: Verdict | null;
	/** `<criterion>.<state>`, or `vigilance.red` / `vigilance.orange`: why the verdict is not good. */
	reason: string | null;
	slot: { start: number; end: number } | null;
	/** The verdict of the current hour, night or day. */
	now: Verdict | null;
}

export interface SeaSpot {
	id: string;
	name: string;
	place: string | null;
	lat: number;
	lon: number;
	activities: SeaActivity[];
	/** `unknown`: the official coastal warnings could not be read for this spot, so nothing is capped there. */
	warnings: 'ok' | 'unknown';
	/** The highest official coastal warning level in the next 24 hours (orange or red); null otherwise. */
	coastalLevel: 'ORANGE' | 'RED' | null;
}

export interface SeaOverview {
	generated: number;
	windRange: { min: number; max: number } | null;
	spots: SeaSpot[];
	limits: string | null;
	disclaimer: string | null;
	stale: boolean;
	attribution: string | null;
}

const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const verdictOf = (v: unknown): Verdict | null => (VERDICTS.includes(v as Verdict) ? (v as Verdict) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function activityFromApi(raw: unknown): SeaActivity | null {
	const a = obj(raw);
	const id = a.id as ActivityId;
	if (!ACTIVITY_IDS.includes(id)) return null;
	const slot = obj(a.best_slot);
	const start = num(slot.start_utc);
	const end = num(slot.end_utc);
	return {
		id,
		available: a.available === true,
		verdict: verdictOf(a.verdict),
		reason: str(a.reason),
		slot: start != null && end != null && end > start ? { start, end } : null,
		now: verdictOf(a.now)
	};
}

function spotFromApi(raw: unknown): SeaSpot | null {
	const s = obj(raw);
	const id = str(s.id);
	const name = str(s.name);
	const lat = num(s.lat);
	const lon = num(s.lon);
	if (!id || !name || lat == null || lon == null) return null;
	const level = typeof s.coastal_level === 'string' ? s.coastal_level.toUpperCase() : null;
	return {
		id,
		name,
		place: str(s.place),
		lat,
		lon,
		activities: list(s.activities)
			.map(activityFromApi)
			.filter((a): a is SeaActivity => a != null)
			.sort((x, y) => ACTIVITY_IDS.indexOf(x.id) - ACTIVITY_IDS.indexOf(y.id)),
		// Warnings that could not be read are not "none": the flag says it, and the page does not call the spot clear.
		warnings: s.warnings === 'ok' ? 'ok' : 'unknown',
		coastalLevel: level === 'RED' || level === 'ORANGE' ? level : null
	};
}

/** Every spot in short; null when the answer has none (or is not an overview at all). */
export function seaOverviewFromApi(raw: unknown): SeaOverview | null {
	const r = obj(raw);
	const generated = num(r.generated_utc);
	if (generated == null) return null;
	const spots = list(r.spots)
		.map(spotFromApi)
		.filter((s): s is SeaSpot => s != null)
		.sort((a, b) => b.lat - a.lat);
	if (!spots.length) return null;
	const range = obj(r.wind_range);
	const min = num(range.min_kn);
	const max = num(range.max_kn);
	return {
		generated,
		windRange: min != null && max != null ? { min, max } : null,
		spots,
		limits: str(r.limits),
		disclaimer: str(r.disclaimer),
		stale: r.stale === true,
		attribution: str(r.attribution)
	};
}

// --- the activities in the address -------------------------------------------------------------------------------------------

/** The address of each activity: `/sea/<slug>`. The API's `shore_fishing` has a hyphen in the address. */
export const SLUGS: Record<ActivityId, string> = {
	surf: 'surf',
	kite: 'kite',
	boat: 'boat',
	shore_fishing: 'shore-fishing'
};

export function activityOfSlug(slug: string): ActivityId | null {
	return ACTIVITY_IDS.find((id) => SLUGS[id] === slug) ?? null;
}

// --- putting the spots in order ----------------------------------------------------------------------------------------------

export const VERDICT_RANK: Record<Verdict, number> = { good: 0, possible: 1, poor: 2 };
const rankOf = (v: Verdict | null): number => (v == null ? 3 : VERDICT_RANK[v]);

/** Spots beyond this distance from the place are not "near" it: a verdict 300 km away does not answer "can I go?". */
export const NEAR_KM = 160;

export interface SeaRow {
	spot: SeaSpot;
	activity: SeaActivity;
	/** Distance from the place, when one is known. */
	km: number | null;
}

/** The spots that can be judged for an activity, best verdict first, then the nearest (or by name without a place). */
export function rankSpots(
	spots: SeaSpot[],
	activity: ActivityId,
	at: { lat: number; lon: number } | null
): SeaRow[] {
	return spots
		.flatMap((spot): SeaRow[] => {
			const found = spot.activities.find((a) => a.id === activity);
			return found && found.available
				? [{ spot, activity: found, km: at ? distanceKm(at, spot) : null }]
				: [];
		})
		.sort(
			(a, b) =>
				rankOf(a.activity.verdict) - rankOf(b.activity.verdict) ||
				(a.km ?? 0) - (b.km ?? 0) ||
				a.spot.name.localeCompare(b.spot.name, 'fr')
		);
}

export interface Tally {
	good: number;
	possible: number;
	poor: number;
	unknown: number;
}

export function tally(rows: SeaRow[]): Tally {
	const t: Tally = { good: 0, possible: 0, poor: 0, unknown: 0 };
	for (const r of rows) t[r.activity.verdict ?? 'unknown'] += 1;
	return t;
}

/** What the page says in its first sentence, as data: the texts are the page's, the figures are the API's. */
export type Answer =
	| { kind: 'none' }
	| {
			kind: 'good' | 'possible';
			count: number;
			name: string;
			km: number | null;
			slot: { start: number; end: number } | null;
	  }
	| { kind: 'poor'; name: string; km: number | null; reason: string | null }
	| { kind: 'unknown'; total: number }
	| { kind: 'far'; name: string; km: number; verdict: Verdict | null };

/**
 * The answer to "can I go?" for an activity. With a place: among the spots within `NEAR_KM` (the nearest first among the best
 * verdict); when none is that close, the nearest one, said to be far. Without a place: the best of all of them.
 */
export function answerOf(rows: SeaRow[], at: { lat: number; lon: number } | null): Answer {
	if (!rows.length) return { kind: 'none' };
	const pool = at ? rows.filter((r) => r.km != null && r.km <= NEAR_KM) : rows;
	if (!pool.length) {
		const nearest = [...rows].sort((a, b) => (a.km ?? 0) - (b.km ?? 0))[0];
		return { kind: 'far', name: nearest.spot.name, km: nearest.km ?? 0, verdict: nearest.activity.verdict };
	}
	const best = pool[0];
	const verdict = best.activity.verdict;
	if (verdict == null) return { kind: 'unknown', total: pool.length };
	if (verdict === 'poor') {
		return { kind: 'poor', name: best.spot.name, km: best.km, reason: best.activity.reason };
	}
	const count = pool.filter((r) => r.activity.verdict === verdict).length;
	return { kind: verdict, count, name: best.spot.name, km: best.km, slot: best.activity.slot };
}
