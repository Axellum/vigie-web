import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { eventsFromApi, eventTitle, hazardsOf, MIN_IMPACT, worldSentence, type WorldEvent } from './events';
import type { Hazard } from './types';

const raw = JSON.parse(readFileSync(join(process.cwd(), 'e2e', 'fixtures', 'events.json'), 'utf-8'));

function event(over: Partial<WorldEvent>): WorldEvent {
	return {
		id: 'x',
		kind: 'warnings',
		family: 'cold',
		category: null,
		impact: 23,
		level: 'YELLOW',
		country: 'CH',
		areasCount: 13,
		areaNames: ['Vispertal - Nanztal'],
		start: null,
		end: null,
		bbox: [7.34, 45.82, 9.3, 46.5],
		sources: ['meteoalarm'],
		quakes: null,
		attribution: null,
		...over
	};
}
const hazard = (over: Partial<Hazard>) =>
	({
		id: 'h',
		category: 'EARTHQUAKE',
		level: 'ORANGE',
		title: 'M 6.0 - VANUATU',
		value: 6,
		lon: 165.5,
		lat: -13.9,
		...over
	}) as Hazard;

describe('the world in events', () => {
	it('reads the recorded answer, the strongest first, with the counts of the API', () => {
		const world = eventsFromApi(raw);
		expect(world.events).toHaveLength(raw.events.length);
		const impacts = world.events.map((e) => e.impact);
		expect(impacts).toEqual([...impacts].sort((a, b) => b - a));
		expect(world.counts.RED).toBe(raw.counts.by_level.RED ?? 0);
		expect(world.counts.ORANGE).toBe(raw.counts.by_level.ORANGE ?? 0);
		// An official green warning is nothing in force (impact 0); a cyclone counts whatever its level (60 at least).
		const listed = world.events.filter((e) => e.impact >= MIN_IMPACT);
		expect(listed.filter((e) => e.kind === 'warnings').every((e) => e.level !== 'GREEN')).toBe(true);
		expect(world.events.filter((e) => e.category === 'HURRICANE').every((e) => e.impact >= 60)).toBe(true);
	});

	it('says which source did not answer, and counts an earthquake sequence as the API does', () => {
		const world = eventsFromApi({
			events: [
				{
					id: 'q',
					kind: 'earthquakes',
					impact_reasons: ['earthquake of magnitude 6 (orange)', '5 earthquakes in the sequence']
				}
			],
			coverage: [
				{ source: 'meteoalarm', country: 'FR', status: 'ok' },
				{ source: 'meteoalarm', country: 'IT', status: 'error' }
			]
		});
		expect(world.missing).toEqual([{ source: 'meteoalarm', country: 'IT' }]);
		expect(world.events[0].quakes).toBe(5);
		expect(world.events[0].family).toBe('other');
	});
});

describe('titles and the sentence', () => {
	it('writes a group of warnings with the family, the country and its areas', () => {
		expect(eventTitle('fr', event({}), [])).toBe('Froid · Suisse · 13 zones');
		expect(eventTitle('en', event({ areasCount: 1 }), [])).toBe('Cold · Switzerland · Vispertal - Nanztal');
	});

	it("keeps a hazard's own title when the site reads it, else its kind and country", () => {
		const quakes = event({
			kind: 'earthquakes',
			family: 'earthquake',
			category: 'EARTHQUAKE',
			country: null,
			areasCount: null,
			bbox: [165.44, -13.99, 165.71, -13.7],
			quakes: 5
		});
		const strongest = hazard({});
		expect(hazardsOf(quakes, [hazard({ id: 'a', value: 4.5 }), strongest, hazard({ lon: 10 })])[0]).toBe(
			strongest
		);
		expect(eventTitle('fr', quakes, [strongest])).toBe('M 6.0 - VANUATU · 5 séismes');
		const storm = event({
			kind: 'hazard',
			family: 'cyclone',
			category: 'HURRICANE',
			country: 'IN',
			bbox: [81.8, 16.4, 81.8, 16.4]
		});
		expect(eventTitle('fr', storm, [])).toBe('Cyclone · Inde');
	});

	it('names what is red, then counts orange and yellow', () => {
		const world = eventsFromApi(raw);
		const red = world.events.filter((e) => e.level === 'RED');
		const said = worldSentence('fr', world, []);
		expect(said[0]).toMatch(red.length ? new RegExp(`^${red.length} en rouge : `) : /^Rien en rouge\.$/);
		expect(said[1]).toBe(`${world.counts.ORANGE} en orange, ${world.counts.YELLOW} en jaune.`);
		expect(worldSentence('en', { ...world, events: [] }, [])[0]).toBe('Nothing red.');
	});
});
