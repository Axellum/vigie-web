// Records real answers of a Vigie API instance into e2e/fixtures/, for the unit and end-to-end tests.
//   VIGIE_API_URL=http://127.0.0.1:8080 node scripts/record-fixtures.mjs           # all of them
//   VIGIE_API_URL=http://127.0.0.1:8080 node scripts/record-fixtures.mjs point     # only these names
// The tests never call the network: they replay these files (e2e/mock-api.mjs).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const api = (process.env.VIGIE_API_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const out = join(import.meta.dirname, '..', 'e2e', 'fixtures');
const countries = ['FR', 'DE', 'BE', 'ES', 'IT', 'GB', 'US', 'CA', 'NZ', 'MX', 'GR', 'HR'];

// [file name, path asked, key the mock answers it under (default: the path)]
const targets = [
	['health', '/v1/health'],
	['providers', '/v1/providers'],
	['hazards', '/v1/geojson/hazards'],
	// Every country: the served ones, then the others and why (the site asks with ?uncovered=true).
	['vigilances-countries', '/v1/vigilances/countries?uncovered=true', '/v1/vigilances/countries'],
	...countries.map((cc) => [`warnings-${cc}`, `/v1/vigilances.geojson?country=${cc}`]),
	// One weather answer (Corte, Haute-Corse): the mock gives it for every position.
	[
		'point',
		'/v1/point?lat=42.3&lon=9.15&marine=false&device_type=web&max_hazards=1&radius_km=1',
		'/v1/point'
	],
	// Active fires (NASA FIRMS): a grid of southern Africa and the detections of one tile of 2° in Zambia. The mock
	// gives them for every tile.
	['fires-grid', '/v1/fires/grid?bbox=20,-20,40,0&cell_deg=1&limit=20000', '/v1/fires/grid'],
	['fires', '/v1/fires?bbox=28,-16,30,-14&limit=300', '/v1/fires'],
	// The tide (computed by the API, no provider): the curve near Saint-Malo, answered only for that position (elsewhere the
	// mock says "no tide here", as the API does inland), and the coast of one tile of 5° (Brittany), given for every tile.
	['tides', '/v1/tides?lat=48.65&lon=-2.05&days=2&interval_minutes=15', '/v1/tides?lat=48.65&lon=-2.05'],
	['tides-coast', '/v1/tides/coast?bbox=-5,45,0,50&limit=400', '/v1/tides/coast'],
	// The world in events (the home page): the compact answer the site asks for, without the alerts themselves.
	['events', '/v1/events?compact=true', '/v1/events'],
	// Travel advice: every country, one country (Uganda: the ministries disagree, Canada's text in two languages, an ECDC
	// item names it or not), and the ECDC's publications.
	['travel', '/v1/travel'],
	['travel-UG', '/v1/travel/UG'],
	['travel-health', '/v1/travel/health'],
	// The surf spots (OpenStreetMap, bundled in the API), every spot in short (its current hour and best slot), and the forecast
	// of one, Hossegor, for three days (Open-Meteo through the API); the mock gives that forecast for that spot only.
	['surf-spots', '/v1/surf/spots'],
	['surf-overview', '/v1/surf/overview'],
	[
		'surf-hossegor',
		'/v1/surf/spots/soorts-hossegor-plage-sud-point-d-or?days=3',
		'/v1/surf/spots/soorts-hossegor-plage-sud-point-d-or'
	],
	// The verdicts of the same spot for surf, kite, boat and shore fishing, hour by hour (rules of Vigie, ADR 0016 of the API),
	// and the nearest CANDHIS wave buoy of every spot (a list bundled in the API).
	[
		'activities-hossegor',
		'/v1/activities/soorts-hossegor-plage-sud-point-d-or?days=3',
		'/v1/activities/soorts-hossegor-plage-sud-point-d-or'
	],
	['surf-buoys', '/v1/surf/buoys'],
	// The headline of the four activities of every spot at once (the sea pages), asked with the default wind range of the kite.
	['activities-overview', '/v1/activities/overview'],
	// The catalogue of the coast (a file bundled in the API, ADR 0021 of the API). The mock keys these answers by the kinds, the
	// words and whether a position is given, not by the position or the page (e2e/mock-api.mjs): the count of each kind, the dive
	// sites, the words "malo", and the places around Saint-Malo for the kinds the page of a place asks for (rare, common) and for
	// "around my position"; then four places by their address (a port, a bathing site, a slipway without a name, a dive site).
	['sea-places-count', '/v1/sea/places?limit=1', '/v1/sea/places?'],
	['sea-places-dive', '/v1/sea/places?type=dive&limit=24', '/v1/sea/places?type=dive'],
	['sea-places-malo', '/v1/sea/places?q=malo&limit=24', '/v1/sea/places?q=malo'],
	[
		'sea-places-near',
		'/v1/sea/places?near_lat=48.64&near_lon=-2.02&radius_km=25&limit=24',
		'/v1/sea/places?near'
	],
	[
		'sea-places-near-rare',
		'/v1/sea/places?type=anchorage&type=dive&type=port&near_lat=48.64&near_lon=-2.02&radius_km=25&limit=13',
		'/v1/sea/places?near&type=anchorage+dive+port'
	],
	[
		'sea-places-near-common',
		'/v1/sea/places?type=bathing&type=slipway&near_lat=48.64&near_lon=-2.02&radius_km=10&limit=13',
		'/v1/sea/places?near&type=bathing+slipway'
	],
	['sea-place-port', '/v1/sea/places/port-port-de-saint-malo-f697'],
	['sea-place-bathing', '/v1/sea/places/bathing-bon-secours-4142'],
	['sea-place-slipway', '/v1/sea/places/slipway-saint-malo-eb59'],
	['sea-place-dive', '/v1/sea/places/dive-pytheas-ffa1'],
	// The weather of the cell of a spot of the Landes coast, asked with the sea as a television screen asks it (the temperature of the
	// water). The mock gives it for that cell only; every other position gets `point`.
	[
		'tv-point-hossegor',
		'/v1/point?lat=43.65&lon=-1.45&marine=true&device_type=web&max_hazards=1&radius_km=1',
		'/v1/point?lat=43.65&lon=-1.45&marine=true'
	]
];

await mkdir(out, { recursive: true });
const only = process.argv.slice(2);
// Recording a few names keeps the other answers and their entries in the index.
const previous = only.length ? JSON.parse(await readFile(join(out, 'index.json'), 'utf-8')) : null;
const index = previous?.paths ?? {};
const recorded = previous?.recorded ?? {};
for (const [name, path, key = path] of targets) {
	if (only.length && !only.includes(name)) continue;
	const response = await fetch(api + path, { headers: { accept: 'application/json' } });
	if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
	const body = await response.json();
	await writeFile(join(out, `${name}.json`), JSON.stringify(body));
	index[key] = `${name}.json`;
	recorded[`${name}.json`] = Math.floor(Date.now() / 1000);
	console.log(`${path} -> ${name}.json`);
}
await writeFile(
	join(out, 'index.json'),
	JSON.stringify(
		{
			recorded_utc: previous?.recorded_utc ?? Math.floor(Date.now() / 1000),
			// When some answers were recorded later than the others.
			...(only.length ? { recorded } : {}),
			source: 'a Vigie API instance',
			paths: index,
			// Kept: answers added by hand to a path, and why (see e2e/mock-api.mjs).
			...(previous?.added ? { added: previous.added } : {}),
			...(previous?.notes ? { notes: previous.notes } : {})
		},
		null,
		1
	)
);
