import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTIVITY_IDS } from '../activities';
import {
	activityOfSlug,
	answerOf,
	NEAR_KM,
	rankSpots,
	seaOverviewFromApi,
	SLUGS,
	tally,
	type SeaActivity,
	type SeaSpot
} from './overview';

const fixture = (name: string) =>
	JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'e2e', 'fixtures', name), 'utf-8'));

describe('the verdicts of every spot', () => {
	const raw = fixture('activities-overview.json');
	const overview = seaOverviewFromApi(raw)!;

	it('reads every spot with its four activities in the same order, north to south', () => {
		expect(overview.spots.length).toBe(raw.count);
		for (const s of overview.spots) expect(s.activities.map((a) => a.id)).toEqual(ACTIVITY_IDS);
		expect(overview.spots.map((s) => s.lat)).toEqual(
			[...overview.spots.map((s) => s.lat)].sort((a, b) => b - a)
		);
		expect(overview.windRange).toEqual({ min: 12, max: 25 });
		expect(overview.attribution).toContain('Open-Meteo');
		expect(overview.disclaimer).toContain('Not for safety');
	});

	it('keeps each headline as the API gave it, and the slot only as a run of hours', () => {
		const source = raw.spots.find((s: { id: string }) => s.id === overview.spots[0].id);
		overview.spots[0].activities.forEach((a, i) => {
			const api = source.activities[i];
			expect([a.available, a.verdict, a.reason, a.now]).toEqual([
				api.available,
				api.verdict,
				api.reason,
				api.now
			]);
			expect(a.slot).toEqual(
				api.best_slot ? { start: api.best_slot.start_utc, end: api.best_slot.end_utc } : null
			);
		});
	});

	it('does not call a spot clear when its warnings could not be read', () => {
		const odd = seaOverviewFromApi({
			...raw,
			spots: [
				{ ...raw.spots[0], warnings: 'unknown', coastal_level: 'red' },
				{ ...raw.spots[1], warnings: 'whatever', coastal_level: 'YELLOW' }
			]
		})!;
		expect(odd.spots.map((s) => [s.warnings, s.coastalLevel])).toEqual([
			['unknown', 'RED'],
			['unknown', null]
		]);
	});

	it('drops what it cannot read and gives null for an answer that is not an overview', () => {
		expect(seaOverviewFromApi(null)).toBeNull();
		expect(seaOverviewFromApi({ generated_utc: 1, spots: [] })).toBeNull();
		expect(seaOverviewFromApi({ spots: raw.spots })).toBeNull();
		const some = seaOverviewFromApi({
			generated_utc: 1,
			spots: [
				{ ...raw.spots[0], name: '' },
				{
					...raw.spots[1],
					activities: [{ id: 'diving', verdict: 'good' }, ...raw.spots[1].activities.slice(0, 1)]
				}
			]
		})!;
		expect(some.spots).toHaveLength(1);
		expect(some.spots[0].activities.map((a) => a.id)).toEqual(['surf']);
	});

	it('has an address for each activity, and reads it back', () => {
		expect(Object.keys(SLUGS)).toEqual(ACTIVITY_IDS);
		for (const id of ACTIVITY_IDS) expect(activityOfSlug(SLUGS[id])).toBe(id);
		expect(SLUGS.shore_fishing).toBe('shore-fishing');
		expect(activityOfSlug('shore_fishing')).toBeNull();
		expect(activityOfSlug('diving')).toBeNull();
	});
});

// A few spots made for the ordering and the sentence: the figures of a real day cannot cover every case.
const act = (
	id: SeaActivity['id'],
	verdict: SeaActivity['verdict'],
	extra: Partial<SeaActivity> = {}
): SeaActivity => ({
	id,
	available: true,
	verdict,
	reason: verdict && verdict !== 'good' ? 'wind.too_light' : null,
	slot: verdict === 'poor' ? null : { start: 1_794_132_000, end: 1_794_139_200 },
	now: verdict,
	...extra
});
const spot = (
	id: string,
	lat: number,
	lon: number,
	kite: SeaActivity['verdict'],
	extra: Partial<SeaActivity> = {}
): SeaSpot => ({
	id,
	name: id.toUpperCase(),
	place: null,
	lat,
	lon,
	activities: [act('kite', kite, extra)],
	warnings: 'ok',
	coastalLevel: null
});

describe('putting the spots in order', () => {
	const bayonne = { lat: 43.49, lon: -1.47 };
	const spots = [
		spot('quimper', 47.99, -4.1, 'good'),
		spot('hossegor', 43.66, -1.44, 'possible'),
		spot('biarritz', 43.48, -1.56, 'poor'),
		spot('capbreton', 43.64, -1.43, 'possible'),
		spot('arcachon', 44.66, -1.17, 'good'),
		spot('nowhere', 44, -1, null, { available: false })
	];

	it('puts the best verdict first, the nearest first among equals, and leaves out a spot that cannot be judged', () => {
		const rows = rankSpots(spots, 'kite', bayonne);
		expect(rows.map((r) => r.spot.id)).toEqual(['arcachon', 'quimper', 'capbreton', 'hossegor', 'biarritz']);
		expect(rows[0].km).toBeGreaterThan(100);
		expect(rankSpots(spots, 'surf', bayonne)).toEqual([]);
	});

	it('goes by name among equals when no place is known', () => {
		const rows = rankSpots(spots, 'kite', null);
		expect(rows.map((r) => r.spot.id)).toEqual(['arcachon', 'quimper', 'capbreton', 'hossegor', 'biarritz']);
		expect(rows.every((r) => r.km === null)).toBe(true);
	});

	it('counts the verdicts, an unknown one apart', () => {
		const withUnknown = [...spots, spot('x', 44, -1, null)];
		expect(tally(rankSpots(withUnknown, 'kite', null))).toEqual({
			good: 2,
			possible: 2,
			poor: 1,
			unknown: 1
		});
	});

	it('answers "can I go?" from the spots near the place, and says so when there is none', () => {
		const near = answerOf(rankSpots(spots, 'kite', bayonne), bayonne);
		expect(near).toMatchObject({ kind: 'good', count: 1, name: 'ARCACHON' });
		expect(near.kind === 'good' && near.km).toBeLessThanOrEqual(NEAR_KM);
		expect(
			answerOf(
				rankSpots(
					spots.filter((s) => s.id !== 'arcachon'),
					'kite',
					bayonne
				),
				bayonne
			)
		).toMatchObject({
			kind: 'possible',
			count: 2,
			name: 'CAPBRETON'
		});
		expect(answerOf(rankSpots([spots[2]], 'kite', bayonne), bayonne)).toMatchObject({
			kind: 'poor',
			name: 'BIARRITZ',
			reason: 'wind.too_light'
		});
		const brittany = { lat: 48.4, lon: -4.5 };
		const far = answerOf(rankSpots([spots[1], spots[2]], 'kite', brittany), brittany);
		expect(far).toMatchObject({ kind: 'far', name: 'HOSSEGOR', verdict: 'possible' });
		expect(far.kind === 'far' && far.km).toBeGreaterThan(NEAR_KM);
	});

	it('answers from all the spots without a place, and says what it does not know', () => {
		expect(answerOf(rankSpots(spots, 'kite', null), null)).toMatchObject({
			kind: 'good',
			count: 2,
			name: 'ARCACHON',
			km: null
		});
		expect(answerOf([], null)).toEqual({ kind: 'none' });
		expect(answerOf(rankSpots([spot('x', 44, -1, null)], 'kite', null), null)).toEqual({
			kind: 'unknown',
			total: 1
		});
	});
});
