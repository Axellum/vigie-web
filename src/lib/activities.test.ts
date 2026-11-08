import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	ACTIVITY_IDS,
	ACTIVITY_TEXT,
	activitiesFromApi,
	activityText,
	axisHour,
	buoyOf,
	buoysFromApi,
	criterionValueText,
	reasonText,
	ruleLines,
	stateText,
	tideOfDay,
	verdictDays,
	verdictRuns
} from './activities';

const fixture = (name: string) =>
	JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'e2e', 'fixtures', name), 'utf-8'));

describe('the verdicts of a spot', () => {
	const raw = fixture('activities-hossegor.json');
	const v = activitiesFromApi(raw)!;

	it('reads the four activities in the same order, each with its hours, its best slot and the criteria it stands on', () => {
		expect(v.activities.map((a) => a.id)).toEqual(ACTIVITY_IDS);
		for (const a of v.activities) {
			expect(a.available).toBe(true);
			expect(a.hours.length).toBe(raw.activities.find((x: { id: string }) => x.id === a.id).hours.length);
			expect(a.hours.map((h) => h.t)).toEqual([...a.hours.map((h) => h.t)].sort((x, y) => x - y));
			expect(a.detail!.criteria.length).toBeGreaterThan(0);
		}
		const surf = v.activities[0];
		expect(surf.slot).toEqual({
			start: raw.activities[0].best_slot.start_utc,
			end: raw.activities[0].best_slot.end_utc
		});
		expect(surf.detail!.points).toBe(raw.activities[0].detail.points);
		expect(v.windRange).toEqual({ min: 12, max: 25 });
	});

	it('keeps the tide, the warnings, the rules and the credit as the API gave them', () => {
		expect(v.tide!.extremes.length).toBe(raw.tide.extremes.length);
		expect(v.tide!.extremes[0]).toMatchObject({ kind: 'low', height: -1.66 });
		expect(v.vigilance).toEqual({ status: 'ok', alerts: [] });
		expect(Object.keys(v.rules)).toEqual(
			expect.arrayContaining(['kite', 'boat', 'shore_fishing', 'vigilance'])
		);
		expect(v.attribution).toContain('Open-Meteo');
		expect(v.stale).toBe(false);
	});

	it('leaves out what it does not know instead of filling it in', () => {
		const odd = activitiesFromApi({
			generated_utc: 1,
			spot: { id: 'a', name: 'A', lat: 44, lon: -1.2, facing_deg: 280 },
			activities: [
				{ id: 'surf', available: true, verdict: 'excellent', best_slot: { start_utc: 5, end_utc: 5 } },
				{ id: 'ski', available: true, verdict: 'good' },
				{ id: 'boat', available: false, note: 'No tide model near.' }
			],
			vigilance: { status: 'weird' }
		})!;
		expect(odd.activities.map((a) => a.id)).toEqual(['surf', 'boat']);
		expect(odd.activities[0].verdict).toBeNull();
		expect(odd.activities[0].slot).toBeNull();
		expect(odd.activities[1]).toMatchObject({ available: false, note: 'No tide model near.' });
		// Warnings that could not be read are not read as "none".
		expect(odd.vigilance.status).toBe('unknown');
		expect(odd.tide).toBeNull();
		expect(activitiesFromApi({ generated_utc: 1 })).toBeNull();
		expect(activitiesFromApi(null)).toBeNull();
	});

	it('groups the hours by day of the spots’ time zone, by daylight unless asked for the night', () => {
		const day = verdictDays(v.activities);
		const all = verdictDays(v.activities, true);
		expect(all.reduce((n, d) => n + d.hours.length, 0)).toBe(v.activities[0].hours.length);
		expect(day.reduce((n, d) => n + d.hours.length, 0)).toBeLessThan(
			all.reduce((n, d) => n + d.hours.length, 0)
		);
		for (const d of all) expect(d.hours.length).toBeLessThanOrEqual(25);
		const daylight = new Map(v.activities[0].hours.map((h) => [h.t, h.daylight]));
		for (const d of day) for (const t of d.hours) expect(daylight.get(t)).not.toBe(false);
	});

	it('says the tide of each day, with the coefficient it estimates', () => {
		const first = verdictDays(v.activities, true)[0];
		const tide = tideOfDay(v.tide, first.key);
		expect(tide.extremes.length).toBeGreaterThan(0);
		expect(tide.extremes.every((e) => first.hours.length > 0 && e.t > 0)).toBe(true);
		expect(tideOfDay(null, first.key)).toEqual({ extremes: [], coefficients: [] });
	});

	it('joins consecutive hours of one verdict in a run, and cuts at a gap or a change', () => {
		const h = (t: number, verdict: 'good' | 'possible' | 'poor' | null) => ({
			t,
			daylight: true,
			verdict,
			reason: null
		});
		const hours = [h(0, 'good'), h(3600, 'good'), h(7200, 'poor'), h(14400, 'poor'), h(18000, null)];
		expect(verdictRuns(hours, [0, 3600, 7200, 14400, 18000])).toEqual([
			{ verdict: 'good', from: 0, to: 3600 },
			{ verdict: 'poor', from: 7200, to: 7200 },
			{ verdict: 'poor', from: 14400, to: 14400 },
			{ verdict: null, from: 18000, to: 18000 }
		]);
		expect(axisHour(Date.UTC(2026, 10, 8, 8) / 1000)).toBe(9);
		expect(axisHour(Date.UTC(2026, 10, 8, 9) / 1000)).toBeNull();
	});
});

describe('the words of the verdicts', () => {
	const v = activitiesFromApi(fixture('activities-hossegor.json'))!;

	it('has a word, in both languages, for every reason and every state the API gave for this spot', () => {
		for (const a of v.activities) {
			const codes = new Set<string>();
			for (const h of a.hours) if (h.reason) codes.add(h.reason);
			if (a.reason) codes.add(a.reason);
			for (const c of a.detail?.criteria ?? []) if (c.state) codes.add(`${c.name}.${c.state}`);
			for (const code of codes) {
				for (const lang of ['fr', 'en'] as const) {
					expect(reasonText(lang, code), `${lang} ${a.id} ${code}`).not.toBeNull();
				}
			}
		}
	});

	it('says a reason as a criterion and a state, and shows nothing for a code it does not know', () => {
		expect(reasonText('fr', 'swell_height.too_small')).toBe('Hauteur de la houle : trop petite');
		expect(reasonText('en', 'wind.too_strong')).toBe('Wind : too strong');
		expect(reasonText('fr', 'vigilance.red')).toBe('Vigilance côtière : rouge');
		expect(reasonText('fr', 'tsunami.red')).toBeNull();
		expect(reasonText('fr', null)).toBeNull();
		expect(stateText('fr', 'wind', 'something_new')).toBeNull();
	});

	it('writes a value with its unit', () => {
		const c = (value: number | null, unit: string) =>
			({ name: 'x', value, unit, state: null, verdict: null, points: null, max: null }) as const;
		expect(criterionValueText('fr', c(0.4, 'm'))).toBe('0,4 m');
		expect(criterionValueText('fr', c(9.3, 'kn'))).toBe('9 nœuds');
		expect(criterionValueText('en', c(9.3, 'kn'))).toBe('9 kn');
		expect(criterionValueText('fr', c(3, 'Beaufort'))).toBe('force 3');
		expect(criterionValueText('fr', c(100, 'min'))).toBe('dans 100 min');
		expect(criterionValueText('fr', c(18, 'deg'))).toBe('18°');
		expect(criterionValueText('fr', c(84, ''))).toBe('84');
		expect(criterionValueText('fr', c(null, 'm'))).toBeNull();
	});

	it('writes a wind in knots in the unit the visitor chose, and leaves the other units alone', () => {
		const c = (value: number, unit: string) =>
			({ name: 'x', value, unit, state: null, verdict: null, points: null, max: null }) as const;
		expect(criterionValueText('fr', c(18, 'kn'), 'kmh')).toBe('33 km/h');
		expect(criterionValueText('en', c(18, 'kn'), 'kn')).toBe('18 kn');
		expect(criterionValueText('fr', c(18, 'kn'))).toBe('18 nœuds');
		expect(criterionValueText('fr', c(0.4, 'm'), 'kmh')).toBe('0,4 m');
		expect(criterionValueText('fr', c(3, 'Beaufort'), 'kmh')).toBe('force 3');
	});

	it('has the same texts in French and in English', () => {
		expect(Object.keys(ACTIVITY_TEXT.en).sort()).toEqual(Object.keys(ACTIVITY_TEXT.fr).sort());
		expect(activityText('fr', 'run', { verdict: 'bon', from: '10:00', to: '12:00' })).toBe(
			'bon de 10:00 à 12:00'
		);
	});

	it('gives the rules in French while they are the words translated, and in the API’s words once they change', () => {
		const rules = { ...v.rules };
		const fr = ruleLines('fr', rules);
		expect(fr.map((r) => r.key)).toEqual([
			'verdict',
			'headline',
			'surf',
			'kite',
			'boat',
			'shore_fishing',
			'vigilance'
		]);
		for (const r of fr) expect(r.text).not.toBe(rules[r.key]);
		expect(ruleLines('en', rules).every((r) => r.text === rules[r.key])).toBe(true);
		rules.kite = 'a new rule';
		expect(ruleLines('fr', rules).find((r) => r.key === 'kite')!.text).toBe('a new rule');
	});

	// The API wrote the swell cap into its surf rule after the first recording of a spot was made (8 November: a page of
	// a spot had one rule left in English). Two recordings made at different times hold the table to the API's words.
	it('says every rule of both recorded answers of the API in French, the swell cap of the surf included', () => {
		for (const name of ['activities-hossegor.json', 'activities-overview.json']) {
			const rules = fixture(name).rules as Record<string, string>;
			const lines = ruleLines('fr', rules as never);
			expect(lines.length, name).toBe(7);
			for (const r of lines) expect(r.text, `${name} ${r.key}`).not.toBe(rules[r.key]);
		}
		const surf = ruleLines('fr', v.rules).find((r) => r.key === 'surf')!.text;
		expect(surf).toContain('sous 0,5 m, ou 4 m et plus');
		expect(surf).toContain('déconseillé');
	});
});

describe('the nearest wave buoy of a spot', () => {
	const buoys = buoysFromApi(fixture('surf-buoys.json'));

	it('reads the station of every spot, its distance and whether it is close enough to compare', () => {
		expect(buoys.spots.length).toBe(fixture('surf-buoys.json').spots.length);
		expect(buoys.maxComparableKm).toBe(30);
		expect(buoys.attribution).toContain('Candhis');
		const hossegor = buoyOf(buoys, 'soorts-hossegor-plage-sud-point-d-or')!;
		expect(hossegor.buoy).toMatchObject({ name: 'Bayonne', realTime: null });
		expect(hossegor.km).toBe(14.9);
		expect(hossegor.realTimeBuoy).toMatchObject({ name: 'Anglet', realTime: true });
		expect(hossegor.comparable).toBe(true);
	});

	it('gives nothing for a spot the list does not have, or one without a station', () => {
		expect(buoyOf(buoys, 'nowhere')).toBeNull();
		const bare = buoysFromApi({
			spots: [
				{ spot_id: 'a', buoy: null },
				{ spot_id: 'b', buoy: { id: '1', name: 'B' } }
			]
		});
		expect(buoyOf(bare, 'a')).toBeNull();
		expect(buoyOf(bare, 'b')!.comparable).toBe(false);
		expect(buoysFromApi(null).spots).toEqual([]);
	});
});
