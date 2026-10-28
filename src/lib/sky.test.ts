import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	activityWords,
	auroraFromApi,
	auroraSentence,
	ovalFromApi,
	placeTime,
	SKY_KEYS,
	type AuroraPlace
} from './sky';

// A real answer of the API (Tromso, 2026-10-28 21:07 UTC, a quiet night with a nearly full Moon) and its oval.
const recorded = JSON.parse(readFileSync('e2e/fixtures/sky-aurora.json', 'utf-8'));
const recordedOval = JSON.parse(readFileSync('e2e/fixtures/sky-aurora-oval.json', 'utf-8'));

describe('the aurora answer', () => {
	it('keeps what the API gave and nothing else', () => {
		const a = auroraFromApi(recorded);
		expect(a.oval?.forecast).toBe(recorded.oval.forecast_utc);
		expect(a.kp.length).toBe(recorded.kp.length);
		expect(a.kpNow?.kind).toBe(recorded.kp_now.kind);
		expect(a.place?.estimate?.hours.length).toBe(recorded.place.estimate.hours.length);
		expect(a.place?.estimate?.level).toBe('possible');
		expect(a.messages[0].message).toBe(recorded.messages[0].message);
		expect(a.attribution).toContain('NOAA Space Weather Prediction Center');
	});

	it('leaves unknown values null', () => {
		const a = auroraFromApi({
			generated_utc: 1,
			kp: [{ start_utc: 1, end_utc: 2, kp: 'x', kind: 'observed' }],
			place: null
		});
		expect(a.kp).toEqual([]);
		expect(a.oval).toBeNull();
		expect(a.wind).toBeNull();
		expect(a.place).toBeNull();
	});

	it('reads the oval bands', () => {
		const o = ovalFromApi(recordedOval);
		expect(o.features.features.length).toBe(recordedOval.features.length);
		expect(o.forecast).toBe(recordedOval.forecast_utc);
	});
});

describe('the sentence', () => {
	const place = auroraFromApi(recorded).place as AuroraPlace;

	it('says the level, the best hours at the place and where to look, without jargon', () => {
		const fr = auroraSentence('fr', place);
		expect(fr).toMatch(/^Aurore possible, surtout entre 01:00 et 02:00/);
		expect(fr).not.toMatch(/Kp|G\d/);
		expect(auroraSentence('en', place)).toMatch(/^Aurora possible, best between 01:00 and 02:00/);
	});

	it('says why when the chance is low', () => {
		const quiet: AuroraPlace = {
			...place,
			estimate: {
				...(place.estimate as NonNullable<AuroraPlace['estimate']>),
				level: 'very_unlikely',
				best: null,
				hours: place.estimate!.hours.map((h) => ({ ...h, activity: 0, chanceClearSky: 0, chance: 0 }))
			}
		};
		expect(auroraSentence('fr', quiet)).toBe(
			"Aurore très peu probable : l'activité magnétique est trop faible pour cette latitude."
		);
		const cloudy: AuroraPlace = {
			...place,
			estimate: {
				...(place.estimate as NonNullable<AuroraPlace['estimate']>),
				level: 'very_unlikely',
				best: null,
				hours: place.estimate!.hours.map((h) => ({ ...h, clouds: 0, cloudCover: 100, chance: 0 }))
			}
		};
		expect(auroraSentence('en', cloudy)).toBe('Aurora very unlikely: the sky will be too cloudy.');
	});

	it('says when there is no dark night or no index', () => {
		expect(
			auroraSentence('fr', { ...place, estimate: null, noEstimateReason: 'no hour of the next 36 hours…' })
		).toMatch(/Pas de nuit assez noire/);
		expect(
			auroraSentence('en', { ...place, estimate: null, noEstimateReason: "SWPC's Kp could not be read" })
		).toMatch(/could not be read/);
	});

	it('writes the hours in the offset of the place', () => {
		expect(placeTime('fr', 0, 3600)).toBe('01:00');
		expect(placeTime('en', 0, -5 * 3600)).toBe('19:00');
	});

	it('names the activity in words', () => {
		expect(activityWords('fr', { start: 0, end: 1, kp: 2, kind: 'predicted', scale: null })).toBe(
			'Activité magnétique calme'
		);
		expect(activityWords('en', { start: 0, end: 1, kp: 6.3, kind: 'predicted', scale: 'G2' })).toBe(
			'Geomagnetic storm G2'
		);
	});

	it('has the same words in both languages', () => {
		expect(SKY_KEYS.en.sort()).toEqual(SKY_KEYS.fr.sort());
	});
});
