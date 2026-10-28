import { describe, expect, it } from 'vitest';
import detail from '../../e2e/fixtures/sky-eclipse-2027-08-02.json';
import list from '../../e2e/fixtures/sky-eclipses.json';
import map from '../../e2e/fixtures/sky-eclipse-2027-08-02-map.json';
import {
	clock,
	contactName,
	duration,
	ECLIPSE_KEYS,
	eclipseDate,
	eclipseFromApi,
	eclipseListFromApi,
	eclipseMapFromApi,
	eclipseSentences,
	frameAt,
	overlap,
	type Eclipse
} from './eclipse';

// A real answer of the API: the total eclipse of 2 August 2027 seen from Cadiz.
const cadiz = eclipseFromApi(detail)!;

describe('the API answers', () => {
	it('reads the list of NASA eclipses and one seen from a place', () => {
		const parsed = eclipseListFromApi(list);
		expect(parsed.eclipses.length).toBe(list.eclipses.length);
		expect(parsed.eclipses.map((e) => e.id)).toContain('2027-08-02');
		expect(parsed.attribution).toBe("Eclipse Predictions by Fred Espenak, NASA's GSFC");
		expect(cadiz.kind).toBe('total');
		expect(cadiz.here?.kind).toBe('total');
		expect(cadiz.here?.contacts.map((c) => c.name)).toEqual([
			'partial_begin',
			'central_begin',
			'maximum',
			'central_end',
			'partial_end'
		]);
		expect(cadiz.here?.frames?.length).toBeGreaterThan(60);
	});

	it('keeps unknown values unknown and drops an eclipse without its essentials', () => {
		expect(eclipseFromApi({ id: '2027-08-02', kind: 'total' })).toBeNull();
		expect(eclipseFromApi({ id: 'tomorrow', kind: 'total', greatest_utc: 1 })).toBeNull();
		const bare = eclipseFromApi({ id: '2029-01-14', kind: 'partial', greatest_utc: 1 })!;
		expect(bare.pathWidthKm).toBeNull();
		expect(bare.centralDuration).toBeNull();
		expect(bare.here).toBeNull();
	});

	it('reads the map as the API draws it', () => {
		const parsed = eclipseMapFromApi(map);
		const kinds = parsed.features.features.map((f) => f.properties?.kind);
		expect(kinds).toContain('path');
		expect(kinds).toContain('central_line');
		expect(kinds.filter((k) => k === 'obscuration').length).toBe(5);
	});
});

describe('the words', () => {
	it('has the same keys in both languages', () => {
		expect([...ECLIPSE_KEYS.en].sort()).toEqual([...ECLIPSE_KEYS.fr].sort());
	});

	it('says a total eclipse with its length and start, in plain words', () => {
		const [first] = eclipseSentences('fr', cadiz, 'UTC');
		const start = clock('fr', cadiz.here!.contacts[1].time, false, 'UTC');
		expect(first).toBe(
			`Éclipse totale ici : le Soleil sera entièrement caché pendant 2 min 54 s, à partir de ${start}.`
		);
		expect(eclipseSentences('en', cadiz, 'UTC')[0]).toMatch(
			/^Total eclipse here: the Sun will be fully hidden for 2 min 54 s/
		);
	});

	it('says a partial eclipse by the share hidden, a sunset, a low Sun and a path close by', () => {
		const partial: Eclipse = {
			...cadiz,
			here: {
				...cadiz.here!,
				kind: 'partial',
				obscuration: 0.963,
				centralDuration: null,
				contacts: [
					{ name: 'partial_begin', time: 1817192442, sunAltitude: 14, sunUp: true },
					{ name: 'maximum', time: 1817196408, sunAltitude: 9.6, sunUp: true }
				],
				sunset: 1817199000
			}
		};
		const sentences = eclipseSentences('fr', partial, 'UTC');
		expect(sentences[0]).toMatch(/^Éclipse partielle ici : la Lune cachera 96 % du Soleil, au plus fort à /);
		expect(sentences).toContain(
			`Le Soleil se couchera éclipsé, vers ${clock('fr', 1817199000, false, 'UTC')}.`
		);
		expect(sentences.some((s) => s.startsWith('Le Soleil sera bas, à 10°'))).toBe(true);
		expect(sentences).toContain('La bande de totalité passe tout près : voyez la carte.');
	});

	it('says nothing is seen when the shadow does not reach the place', () => {
		const none: Eclipse = { ...cadiz, here: { ...cadiz.here!, kind: 'none', visible: false, contacts: [] } };
		expect(eclipseSentences('fr', none)).toEqual(['L’éclipse ne sera pas visible d’ici.']);
	});

	it('names the contacts for the kind seen at the place', () => {
		expect(contactName('fr', 'central_begin', 'total')).toBe('Début de la totalité');
		expect(contactName('fr', 'central_begin', 'annular')).toBe('Début de l’anneau');
		expect(contactName('en', 'maximum', 'partial')).toBe('Peak');
	});

	it('writes lengths and dates for people', () => {
		expect(duration('fr', 173.6)).toBe('2 min 54 s');
		expect(duration('en', 42)).toBe('42 s');
		expect(eclipseDate('fr', '2027-08-02')).toBe('2 août 2027');
		expect(eclipseDate('en', '2027-08-02')).toBe('2 August 2027');
	});
});

describe('the disc', () => {
	it('hides the share of two overlapping discs', () => {
		expect(overlap(0, 1.05)).toBe(1);
		expect(overlap(0, 0.95)).toBeCloseTo(0.9025, 6);
		expect(overlap(2.1, 1)).toBe(0);
		expect(overlap(1, 1)).toBeCloseTo((2 * Math.PI) / 3 / Math.PI - Math.sqrt(3) / 2 / Math.PI, 9);
	});

	it('moves the Moon between two frames and stays within the first and last', () => {
		const frames = cadiz.here!.frames!;
		expect(frameAt(frames, frames[0].time - 60)).toEqual(frames[0]);
		expect(frameAt(frames, frames[frames.length - 1].time + 60)).toEqual(frames[frames.length - 1]);
		const middle = (frames[10].time + frames[11].time) / 2;
		const f = frameAt(frames, middle)!;
		expect(f.east).toBeCloseTo((frames[10].east + frames[11].east) / 2, 6);
		expect(f.obscuration).toBeGreaterThan(Math.min(frames[10].obscuration, frames[11].obscuration) - 1e-6);
	});
});
