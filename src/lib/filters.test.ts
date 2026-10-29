import { describe, expect, it } from 'vitest';
import type { WorldEvent } from './events';
import {
	applyFilter,
	filterQuery,
	folded,
	foldedSummary,
	isFiltered,
	NO_FILTER,
	parseFilter,
	PROFILE_FILTERS,
	profileOf
} from './filters';
import { PROFILES } from './profiles';

const NOW = 1_800_000_000;
function event(over: Partial<WorldEvent>): WorldEvent {
	return {
		id: over.id ?? 'x',
		kind: 'warnings',
		family: 'wind',
		category: null,
		impact: 60,
		level: 'ORANGE',
		country: 'FR',
		areasCount: 2,
		areaNames: [],
		start: NOW - 3600,
		end: NOW + 3600,
		bbox: null,
		sources: [],
		quakes: null,
		alertIds: [],
		sourceTitle: null,
		attribution: null,
		...over
	};
}

describe('filters in the address', () => {
	it('reads what it knows, once each and in a fixed order, and writes it back the same', () => {
		const f = parseFilter(
			new URLSearchParams('families=coastal,wind,kite,wind&level=orange&period=now&kind=x')
		);
		expect(f).toEqual({ families: ['wind', 'coastal'], level: 'orange', period: 'now', kind: null });
		expect(filterQuery(f)).toBe('?families=wind,coastal&level=orange&period=now');
		expect(parseFilter(new URLSearchParams(filterQuery(f).slice(1)))).toEqual(f);
		expect(filterQuery(NO_FILTER)).toBe('');
		expect(isFiltered(parseFilter(new URLSearchParams('level=green')))).toBe(false);
	});
});

describe('applying the filters', () => {
	const events = [
		event({ id: 'red-rain', family: 'rain-flood', level: 'RED', impact: 90 }),
		event({ id: 'wind' }),
		event({
			id: 'quake',
			kind: 'earthquakes',
			family: 'earthquake',
			category: 'EARTHQUAKE',
			level: 'YELLOW',
			impact: 35
		}),
		event({ id: 'later', start: NOW + 6 * 3600 }),
		event({ id: 'in-two-days', start: NOW + 48 * 3600 }),
		event({ id: 'green', level: 'GREEN', impact: 0 })
	];
	const ids = (f: Partial<typeof NO_FILTER>) =>
		applyFilter(events, { ...NO_FILTER, ...f }, NOW).map((e) => e.id);

	it('keeps what counts, without a filter', () => {
		expect(ids({})).toEqual(['red-rain', 'wind', 'quake', 'later', 'in-two-days']);
	});

	it('filters by family, lowest level, kind of source and period', () => {
		expect(ids({ families: ['wind'] })).toEqual(['wind', 'later', 'in-two-days']);
		expect(ids({ level: 'red' })).toEqual(['red-rain']);
		expect(ids({ level: 'orange' })).not.toContain('quake');
		expect(ids({ kind: 'hazards' })).toEqual(['quake']);
		expect(ids({ kind: 'official' })).not.toContain('quake');
		expect(ids({ period: 'now' })).toEqual(['red-rain', 'wind', 'quake']);
		expect(ids({ period: '24h' })).toEqual(['red-rain', 'wind', 'quake', 'later']);
	});
});

describe('orange first', () => {
	it('folds what is below orange, and says how many of each', () => {
		const events = [
			event({ id: 'red', level: 'RED' }),
			event({ id: 'orange' }),
			event({ id: 'y1', level: 'YELLOW' }),
			event({ id: 'y2', level: 'YELLOW' }),
			event({ id: 'storm', kind: 'hazard', family: 'cyclone', level: 'GREEN' }),
			event({ id: 'tsunami', kind: 'tsunami', family: 'tsunami', level: null })
		];
		expect(events.filter((e) => !folded(e)).map((e) => e.id)).toEqual(['red', 'orange']);
		expect(foldedSummary('fr', events.filter(folded))).toBe('2 en jaune · 1 en vert · 1 sans niveau');
		expect(foldedSummary('en', [events[2]])).toBe('1 yellow');
	});
});

describe('profiles as shortcuts', () => {
	it('gives each profile its own filters, and finds the profile back from them', () => {
		const queries = PROFILES.map((p) => filterQuery(PROFILE_FILTERS[p]));
		expect(new Set(queries).size).toBe(PROFILES.length);
		for (const p of PROFILES) expect(profileOf(PROFILE_FILTERS[p])).toBe(p);
		expect(profileOf(NO_FILTER)).toBeNull();
		expect(filterQuery(PROFILE_FILTERS.surf)).toBe('?families=wind,coastal,cyclone,tsunami');
	});
});
