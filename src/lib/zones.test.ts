import { describe, expect, it } from 'vitest';
import { cleanName } from './names';
import { parseZone, polygonWkt } from './zones';

/** A form as the browser sends it. */
function form(fields: Record<string, string | string[]>) {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) data.append(k, x);
	return data;
}
const rules = { name: 'Maison', minLevel: 'ORANGE', kinds: ['VIGILANCE', 'EARTHQUAKE'] };

describe('parseZone', () => {
	it('reads a circle, rounded to about 100 m, with its rules', () => {
		const r = parseZone(form({ ...rules, kind: 'circle', lat: '42.30612', lon: '9.15049', radiusKm: '25' }));
		expect(r).toEqual({
			ok: true,
			zone: {
				name: 'Maison',
				minLevel: 'ORANGE',
				kinds: ['VIGILANCE', 'EARTHQUAKE'],
				kind: 'circle',
				lat: 42.306,
				lon: 9.15,
				radiusKm: 25,
				profile: null
			}
		});
	});

	it('keeps a known profile, and reads an unknown one as none rather than refusing the zone', () => {
		const circle = { ...rules, kind: 'circle', lat: '43.483', lon: '-1.559', radiusKm: '50' };
		const read = (profile: string) => {
			const r = parseZone(form({ ...circle, profile }));
			return r.ok ? r.zone.profile : 'refused';
		};
		expect(read('surf')).toBe('surf');
		expect(read('')).toBeNull();
		expect(read('kite')).toBeNull();
	});

	it('refuses a radius that is not offered, a position off the Earth, or no shape', () => {
		expect(parseZone(form({ ...rules, kind: 'circle', lat: '42', lon: '9', radiusKm: '7' }))).toEqual({
			ok: false,
			error: 'shape'
		});
		expect(parseZone(form({ ...rules, kind: 'circle', lat: '95', lon: '9', radiusKm: '25' })).ok).toBe(false);
		expect(parseZone(form({ ...rules, kind: 'circle', lat: '', lon: '9', radiusKm: '25' })).ok).toBe(false);
		expect(parseZone(form({ ...rules, kind: 'square' }))).toEqual({ ok: false, error: 'shape' });
	});

	it('reads a drawn polygon and refuses too few or wrong corners', () => {
		const corners = [
			[9.1, 42.2],
			[9.4, 42.2],
			[9.3, 42.5]
		];
		const r = parseZone(form({ ...rules, kind: 'polygon', corners: JSON.stringify(corners) }));
		expect(r.ok && r.zone.kind === 'polygon' && r.zone.corners).toEqual(corners);
		expect(
			parseZone(form({ ...rules, kind: 'polygon', corners: JSON.stringify(corners.slice(0, 2)) })).ok
		).toBe(false);
		expect(parseZone(form({ ...rules, kind: 'polygon', corners: '[[9,"x"],[1,2],[3,4]]' })).ok).toBe(false);
		expect(parseZone(form({ ...rules, kind: 'polygon', corners: 'not json' })).ok).toBe(false);
	});

	it('reads a country and an official area by their codes', () => {
		const c = parseZone(form({ ...rules, kind: 'country', country: 'fr' }));
		expect(c.ok && c.zone.kind === 'country' && c.zone.country).toBe('FR');
		const a = parseZone(form({ ...rules, kind: 'area', country: 'FR', area: 'Haute-Corse' }));
		expect(a.ok && a.zone.kind === 'area' && a.zone.area).toBe('Haute-Corse');
		expect(parseZone(form({ ...rules, kind: 'area', country: 'FR', area: '' })).ok).toBe(false);
	});

	it('needs a name, a level and at least one known kind of alert', () => {
		const zone = { kind: 'country', country: 'FR' };
		expect(parseZone(form({ ...rules, ...zone, name: '  ' }))).toEqual({ ok: false, error: 'name' });
		expect(parseZone(form({ ...rules, ...zone, minLevel: 'GREEN' }))).toEqual({ ok: false, error: 'level' });
		expect(parseZone(form({ ...rules, ...zone, kinds: ['NOPE'] }))).toEqual({ ok: false, error: 'kinds' });
	});
});

describe('names and shapes', () => {
	it('cleans a typed name', () => {
		expect(cleanName('  Camille \u0007 D.  ')).toBe('Camille D.');
		expect(cleanName('x'.repeat(61))).toBeNull();
		expect(cleanName(3)).toBeNull();
	});

	it('closes a polygon for PostGIS', () => {
		expect(
			polygonWkt([
				[1, 2],
				[3, 4],
				[5, 6]
			])
		).toBe('POLYGON((1 2, 3 4, 5 6, 1 2))');
	});
});
