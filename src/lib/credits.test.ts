import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localizedTextField } from './basemap';
import { coverageCount, creditLines, pointCredits, sourceName } from './credits';
import { pointFromApi, warningsFromApi } from './transform';

const fixture = (name: string): unknown =>
	JSON.parse(readFileSync(join(process.cwd(), 'e2e', 'fixtures', `${name}.json`), 'utf-8'));

describe('credits', () => {
	it('gives one line per credit, without empty or repeated ones', () => {
		expect(creditLines(['A | B', null, 'B', undefined, ' C ', ''])).toEqual(['A', 'B', 'C']);
	});

	it('keeps every credit of the weather of a point, and the disclaimer of the fires', () => {
		const raw = fixture('point') as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
		const lines = creditLines(pointCredits(pointFromApi(raw)));
		expect(lines).toContain('Weather data by Open-Meteo.com (https://open-meteo.com/)');
		expect(lines).toContain(raw.fires_nearby.attribution);
		expect(lines).toContain(raw.fires_nearby.disclaimer);
		expect(lines).toContain(raw.space_weather.attribution);
		// Open-Meteo credits every block: it is said once.
		expect(lines.filter((l) => l.includes('Open-Meteo')).length).toBe(1);
	});
});

describe('coverage', () => {
	it('names the sources in the reader’s words, an unknown one by its id', () => {
		expect(sourceName('fr', 'eccc')).toBe('Environnement et Changement climatique Canada');
		expect(sourceName('en', 'eccc')).toBe('Environment and Climate Change Canada');
		expect(sourceName('fr', 'vigicrues')).toBe('Vigicrues');
		expect(sourceName('fr', 'new_source')).toBe('new_source');
	});

	it('says how many warnings a source lists, and how many cannot be drawn, never the API’s note', () => {
		const fr = warningsFromApi('FR', fixture('warnings-FR')).data.coverage;
		const vigicrues = fr.find((c) => c.source === 'vigicrues')!;
		expect(coverageCount('fr', vigicrues)).toBe(`${vigicrues.warningsInFeed} vigilance(s) en cours`);
		const us = warningsFromApi('US', fixture('warnings-US')).data.coverage[0];
		expect(us.warningsNotMatchable).toBeGreaterThan(0);
		expect(coverageCount('en', us)).toBe(
			`${us.warningsInFeed} warning(s) in force, of which ${us.warningsNotMatchable} with no known outline: in the list, not on the map`
		);
		// A source that did not answer has no count to give.
		const ca = warningsFromApi('CA', fixture('warnings-CA')).data.coverage[0];
		expect(ca.status).toBe('unavailable');
		expect(coverageCount('fr', ca)).toBeNull();
		for (const c of [vigicrues, us, ca])
			expect(coverageCount('fr', c) ?? '').not.toMatch(/river_radius_km|[A-Z]{3,} codes/);
	});
});

describe('base map', () => {
	// The text of a label in OpenFreeMap's styles (positron and dark, read on 28/10/2026).
	const field = [
		'case',
		['has', 'name:nonlatin'],
		['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']],
		['coalesce', ['get', 'name_en'], ['get', 'name']]
	];

	it('names places in French where the tiles have the name, and as before elsewhere', () => {
		expect(localizedTextField(field, 'fr')).toEqual(['coalesce', ['get', 'name:fr'], field]);
		expect(localizedTextField(field, 'en')).toBeNull();
		// A road number or a label with no name is left alone.
		expect(localizedTextField(['to-string', ['get', 'ref']], 'fr')).toBeNull();
		expect(localizedTextField(undefined, 'fr')).toBeNull();
	});
});
