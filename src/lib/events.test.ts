import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	eventInView,
	eventsFromApi,
	eventTitle,
	hazardsOf,
	isWorldView,
	MIN_IMPACT,
	nameOf,
	seaOf,
	worldSentence,
	zoneSentence,
	type WorldEvent
} from './events';
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
		alertIds: [],
		sourceTitle: null,
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

	it("writes a hazard in the reader's language: its kind, a name, a magnitude and the place, nothing cut", () => {
		const quakes = event({
			kind: 'earthquakes',
			family: 'earthquake',
			category: 'EARTHQUAKE',
			country: null,
			areasCount: null,
			bbox: [165.44, -13.99, 165.71, -13.7],
			quakes: 5,
			sourceTitle: '5 earthquakes · strongest: M 6.0 - VANUATU'
		});
		const strongest = hazard({ value: 6.1 });
		expect(hazardsOf(quakes, [hazard({ id: 'a', value: 4.5 }), strongest, hazard({ lon: 10 })])[0]).toBe(
			strongest
		);
		// The magnitude of the strongest the site reads, else as the source's title gives it.
		expect(eventTitle('fr', quakes, [strongest])).toBe('Séisme M 6,1 · 5 séismes · Pacifique sud');
		expect(eventTitle('en', quakes, [])).toBe('Earthquake M 6 · 5 earthquakes · South Pacific');
		const storm = event({
			kind: 'hazard',
			family: 'cyclone',
			category: 'HURRICANE',
			country: null,
			bbox: [127.4, 31.2, 127.4, 31.2],
			// As the API gives it: cut in the middle of a word.
			sourceTitle:
				'Tropical Cyclone CHAMPI-26 (Philippines, Guam, Northern Mariana Islands, Japan, China, South Kor'
		});
		expect(eventTitle('fr', storm, [])).toBe('Cyclone CHAMPI-26 · Pacifique nord');
		expect(eventTitle('fr', { ...storm, country: 'IN', sourceTitle: null }, [])).toBe('Cyclone · Inde');
		const volcano = event({
			kind: 'hazard',
			family: 'volcano',
			category: 'VOLCANO',
			country: 'US',
			sourceTitle: 'Great Sitkin volcano (aviation color code ORANGE)'
		});
		expect(eventTitle('fr', volcano, [])).toBe('Volcan Great Sitkin · États-Unis');
	});

	it('takes only the names of storms and volcanoes from a source', () => {
		expect(nameOf('HURRICANE', 'Tropical Depression Vance')).toBe('Vance');
		expect(nameOf('HURRICANE', 'Hurricane Isaias')).toBe('Isaias');
		expect(nameOf('HURRICANE', 'Tropical Cyclone SIMON-26 (México)')).toBe('SIMON-26');
		expect(nameOf('VOLCANO', 'Ahyi Seamount volcano (aviation color code YELLOW)')).toBe('Ahyi Seamount');
		expect(nameOf('FLOOD', 'Flood Warning - Lake, FL')).toBeNull();
		expect(nameOf('HURRICANE', null)).toBeNull();
	});

	it('names the ocean of a hazard at sea, roughly, and no sea inland Asia', () => {
		expect(seaOf(-108.1, 21.1)).toBe('northPacific');
		expect(seaOf(-90, 25)).toBe('northAtlantic');
		expect(seaOf(-32.4, 58.4)).toBe('northAtlantic');
		expect(seaOf(-173.2, -16.5)).toBe('southPacific');
		expect(seaOf(70, -10)).toBe('indian');
		expect(seaOf(18, 36)).toBe('mediterranean');
		expect(seaOf(-28, -60.3)).toBe('southern');
		expect(seaOf(60, 45)).toBeNull();
	});

	it("gives no title of the recorded answer in a source's words", () => {
		const world = eventsFromApi(raw);
		for (const e of world.events) {
			const title = eventTitle('fr', e, []);
			if (e.sourceTitle) expect(title).not.toContain(e.sourceTitle);
			expect(title).not.toMatch(/Tropical|earthquakes|volcano/);
		}
	});

	it('follows the area the map shows: an event by its box, else by its country', () => {
		const greece: [number, number, number, number] = [19, 34.5, 29.7, 42];
		expect(isWorldView(null)).toBe(true);
		expect(isWorldView([-180, -85, 180, 85])).toBe(true);
		expect(isWorldView(greece)).toBe(false);
		expect(eventInView(event({ bbox: [22, 39, 23, 40] }), greece)).toBe(true);
		expect(eventInView(event({ bbox: null, country: 'GR' }), greece)).toBe(true);
		expect(eventInView(event({ bbox: null, country: 'FR' }), greece)).toBe(false);
		expect(eventInView(event({ bbox: null, country: null }), greece)).toBe(false);
		const said = zoneSentence('fr', [event({ level: 'ORANGE' }), event({ level: 'YELLOW' })], []);
		expect(said).toEqual(['Dans la zone affichée : rien en rouge.', '1 en orange, 1 en jaune.']);
		expect(zoneSentence('en', [event({ level: 'RED' })], [])[0]).toBe(
			'In the area shown: 1 red, Cold · Switzerland · 13 areas.'
		);
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
