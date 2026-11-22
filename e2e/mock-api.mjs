// A stand-in for the Vigie API in the end-to-end tests: it replays the answers recorded by
// scripts/record-fixtures.mjs. A country that was not recorded answers 503, like a source that is down.
// `added` in the index lists answers whose features are added to those of a path (the storms and tsunamis,
// which were not active when the rest was recorded). The aurora answers are a forecast for the next hours: they are
// replayed moved by whole days to look recorded today, so the pages that keep only what is current still show them.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, 'fixtures');
const port = Number(process.env.MOCK_API_PORT || 18181);
const {
	paths: index,
	added = {},
	recorded = {}
} = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf-8'));
const read = (file) => JSON.parse(readFileSync(join(dir, file), 'utf-8'));
const today = new Set([
	'sky-aurora.json',
	'sky-aurora-oval.json',
	// The television screen shows the hour it is looked at: these answers of a spot are moved by whole days too.
	'tv-surf-hossegor.json',
	'tv-activities-hossegor.json',
	'tv-tides-hossegor.json'
]);

// Moves every `*_utc` time of an answer by `shift` seconds.
function moved(value, shift) {
	if (Array.isArray(value)) return value.map((v) => moved(v, shift));
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value).map(([k, v]) => [
			k,
			k.endsWith('_utc') && typeof v === 'number' ? v + shift : moved(v, shift)
		])
	);
}

// The catalogue of the coast is asked in many ways (a kind, words, a position, a page): the mock answers by the kinds, the words and
// whether a position is given, never by the position or the page. `/v1/sea/places?type=dive` for the dive sites, `?near&type=a+b` for
// the places around a position of those kinds, `?` for no filter.
function placesKey(url) {
	const types = url.searchParams.getAll('type').sort().join('+');
	const q = url.searchParams.get('q');
	const parts = [
		types && `type=${types}`,
		url.searchParams.has('near_lat') && 'near',
		q && `q=${q.toLowerCase()}`
	].filter(Boolean);
	// `near` first, as the index spells it.
	parts.sort((a, b) => (a === 'near' ? -1 : b === 'near' ? 1 : 0));
	return `/v1/sea/places?${parts.join('&')}`;
}

// The radar's tiles: one recorded tile for every tile of an image of the list. An image the list does not name is a 404, as the API's.
const radarEpochs = new Set(
	JSON.parse(readFileSync(join(dir, 'radar-france.json'), 'utf-8')).frames.map((f) => String(f.epoch))
);
const nowcastEpochs = new Set(
	JSON.parse(readFileSync(join(dir, 'radar-france-nowcast.json'), 'utf-8')).frames.map((f) => String(f.epoch))
);
const observedRainMeta = JSON.parse(readFileSync(join(dir, 'rain-observed.json'), 'utf-8'));
const observedRainStamps = new Set(observedRainMeta.frames.map((f) => String(f.stamp)));

// The overseas areas of the radar (the API's ADR 0037) were not recorded (not deployed yet): their list is the France one with the box
// and the tile address of the area, and their tiles are the same recorded tile.
const radarOverseas = {
	antilles: [-66, 10.59, -57, 21],
	reunion: [51, -25.02, 62.02, -16],
	'new-caledonia': [159.7, -27.27, 171.58, -16.2]
};

createServer((req, res) => {
	const url = new URL(req.url, 'http://mock');
	if (url.pathname === '/v1/radar/france/nowcast') {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(readFileSync(join(dir, 'radar-france-nowcast.json')));
		return;
	}
	const ncTile = /^\/v1\/radar\/france\/nowcast\/tiles\/(\d+)\/(\d+)\/\d+\/\d+\.png$/.exec(url.pathname);
	if (ncTile) {
		const z = Number(ncTile[2]);
		if (!nowcastEpochs.has(ncTile[1]) || z < 3 || z > 10) {
			res.writeHead(404, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ detail: 'unknown nowcast tile' }));
			return;
		}
		res.writeHead(200, { 'content-type': 'image/png' });
		res.end(readFileSync(join(dir, 'radar-tile.png')));
		return;
	}
	if (url.pathname === '/v1/rain/observed') {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(readFileSync(join(dir, 'rain-observed.json')));
		return;
	}
	const obsTile = /^\/v1\/rain\/observed\/tiles\/(\d{12})\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url.pathname);
	if (obsTile) {
		const z = Number(obsTile[2]);
		const x = Number(obsTile[3]);
		const y = Number(obsTile[4]);
		const maxCoord = 2 ** z;
		if (
			!observedRainStamps.has(obsTile[1]) ||
			z < observedRainMeta.min_zoom ||
			z > observedRainMeta.max_zoom ||
			x >= maxCoord ||
			y >= maxCoord
		) {
			res.writeHead(404, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ detail: 'unknown observed rain tile' }));
			return;
		}
		res.writeHead(200, { 'content-type': 'image/png' });
		res.end(readFileSync(join(dir, 'rain-observed-tile.png')));
		return;
	}
	if (url.pathname === '/v1/rain/field') {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(readFileSync(join(dir, 'rain-field.json')));
		return;
	}
	if (url.pathname.startsWith('/v1/rain/field/')) {
		const field = read('rain-field.json');
		const level = field.levels.find((l) => l.frames.some((f) => f.url === url.pathname));
		if (!level) {
			res.writeHead(404, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ detail: 'unknown rain field image' }));
			return;
		}
		res.writeHead(200, { 'content-type': 'image/png' });
		res.end(readFileSync(join(dir, `rain-field-${level.id}.png`)));
		return;
	}
	const area = /^\/v1\/radar\/(antilles|reunion|new-caledonia)$/.exec(url.pathname)?.[1];
	if (area) {
		const list = read('radar-france.json');
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(
			JSON.stringify({
				...list,
				area,
				bounds: radarOverseas[area],
				tile_url_template: `/v1/radar/${area}/tiles/{epoch}/{z}/{x}/{y}.png`
			})
		);
		return;
	}
	const tile =
		/^\/v1\/radar\/(?:france|antilles|reunion|new-caledonia)\/tiles\/(\d+)\/\d+\/\d+\/\d+\.png$/.exec(
			url.pathname
		);
	if (tile) {
		if (!radarEpochs.has(tile[1])) {
			res.writeHead(404, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ detail: 'unknown image' }));
			return;
		}
		res.writeHead(200, { 'content-type': 'image/png' });
		res.end(readFileSync(join(dir, 'radar-tile.png')));
		return;
	}
	// The forecast wind of the map (the API's ADR 0038): the answer recorded with its three images; an image it does not list is a 404.
	if (url.pathname === '/v1/wind/field') {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(readFileSync(join(dir, 'wind-field.json')));
		return;
	}
	if (url.pathname.startsWith('/v1/wind/field/')) {
		const listed = read('wind-field.json').levels.find((l) => l.image === url.pathname);
		if (!listed) {
			res.writeHead(404, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ detail: 'unknown image' }));
			return;
		}
		res.writeHead(200, { 'content-type': 'image/png' });
		res.end(readFileSync(join(dir, `wind-field-${listed.id}.png`)));
		return;
	}
	const key =
		url.pathname === '/v1/sea/places'
			? placesKey(url)
			: url.pathname +
				(url.searchParams.has('country') ? `?country=${url.searchParams.get('country').toUpperCase()}` : '') +
				(url.searchParams.has('source') ? `?source=${url.searchParams.get('source')}` : '') +
				// The weather of the cell of the television spot, asked with the sea, has an answer of its own (the temperature of the
				// water); every other position, with or without the sea, gets the one of `/v1/point`.
				(url.pathname === '/v1/point' &&
				url.searchParams.get('marine') === 'true' &&
				url.searchParams.get('lat') === '43.65' &&
				url.searchParams.get('lon') === '-1.45'
					? '?lat=43.65&lon=-1.45&marine=true'
					: '') +
				(url.pathname === '/v1/tides'
					? `?lat=${url.searchParams.get('lat')}&lon=${url.searchParams.get('lon')}`
					: '');
	// Pollen in Europe, the natural disasters and the climate normals of France and the avalanche bulletin around Davos: one recorded answer each,
	// whatever the position inside; outside, the empty answer the API gives (index.json says where they come from).
	const extra = {
		'/v1/pollens': ['/v1/pollens?europe', (lat, lon) => lat >= 34 && lat <= 72 && lon >= -25 && lon <= 45],
		'/v1/history/catnat': [
			'/v1/history/catnat?fr',
			(lat, lon) => lat >= 41 && lat <= 51.5 && lon >= -5.5 && lon <= 10
		],
		'/v1/climate/normals': [
			'/v1/climate/normals?fr',
			(lat, lon) => lat >= 41 && lat <= 51.5 && lon >= -5.5 && lon <= 10
		],
		'/v1/avalanches': [
			'/v1/avalanches?slf',
			(lat, lon) => lat >= 46.5 && lat <= 47 && lon >= 9.5 && lon <= 10.2
		]
	}[url.pathname];
	// Chamonix, in the Mont-Blanc massif: the Météo-France bulletin (BRA) the API answers there.
	if (
		url.pathname === '/v1/avalanches' &&
		Math.abs(Number(url.searchParams.get('lat')) - 45.92) < 0.3 &&
		Math.abs(Number(url.searchParams.get('lon')) - 6.87) < 0.3
	) {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(readFileSync(join(dir, index['/v1/avalanches?bra'])));
		return;
	}
	if (extra) {
		const lat = Number(url.searchParams.get('lat'));
		const lon = Number(url.searchParams.get('lon'));
		res.writeHead(200, { 'content-type': 'application/json' });
		if (extra[1](lat, lon)) res.end(readFileSync(join(dir, index[extra[0]])));
		else
			res.end(
				JSON.stringify(
					url.pathname === '/v1/pollens'
						? {
								version: '1.1',
								lat,
								lon,
								coverage: 'outside_europe',
								status: 'outside_coverage',
								pollens: null,
								stale: false,
								attribution: null
							}
						: url.pathname === '/v1/climate/normals'
							? {
									status: 'outside_coverage',
									lat,
									lon,
									month: Number(url.searchParams.get('month')),
									station: null,
									normals: null,
									records: null,
									attribution: null
								}
							: url.pathname === '/v1/avalanches'
								? {
										version: '1.2.0',
										query: { lat, lon },
										status: 'outside_coverage',
										covered_by: null,
										note: 'Outside coverage.',
										region_id: null,
										region_name: null,
										max_danger_level: null,
										max_danger_label: null,
										bulletins: [],
										stale: false,
										attribution: null
									}
								: {
										status: 'outside_coverage',
										lat,
										lon,
										country: null,
										commune: null,
										total_decrees: null,
										by_type: [],
										by_year: [],
										decrees: [],
										attribution: null
									}
				)
			);
		return;
	}
	if (url.pathname === '/v1/drought') {
		const lat = Number(url.searchParams.get('lat'));
		const lon = Number(url.searchParams.get('lon'));
		const inFr = lat >= 41 && lat <= 51.5 && lon >= -5.5 && lon <= 10;
		res.writeHead(200, { 'content-type': 'application/json' });
		if (inFr && index['/v1/drought?fr']) {
			res.end(readFileSync(join(dir, index['/v1/drought?fr'])));
		} else {
			res.end(
				JSON.stringify({
					version: '1.1',
					server_utc: 1794742560,
					query: { lat, lon },
					status: 'outside_coverage',
					note: 'Outside covered FR/DROM zones.',
					ambiguous_water_types: [],
					max_level: null,
					restrictions_in_force: null,
					department: null,
					zones: [],
					availability: {},
					as_of: null,
					stale: false,
					attribution:
						'Source: VigiEau, Ministère de la Transition écologique (https://vigieau.gouv.fr). Licence Ouverte 2.0'
				})
			);
		}
		return;
	}
	const file = index[key];
	if (!file) {
		res.writeHead(url.pathname.startsWith('/v1/vigilances') ? 503 : 404, {
			'content-type': 'application/json'
		});
		res.end(JSON.stringify({ detail: 'not recorded' }));
		return;
	}
	res.writeHead(200, { 'content-type': 'application/json' });
	// The ensemble probabilities are Météo-France's: the recorded ones are for a point in France, and the API gives none elsewhere.
	if (url.pathname === '/v1/point' && file === 'point.json') {
		const lat = Number(url.searchParams.get('lat'));
		const lon = Number(url.searchParams.get('lon'));
		const body = read(file);
		if (!(lat >= 41 && lat <= 51.5 && lon >= -5.5 && lon <= 10)) delete body.probabilities;
		// Compact mode (or far-south test coordinates) omits hourly series, mirroring the API's honest null behavior.
		if (url.searchParams.get('compact') !== 'false' || lat < -50) {
			body.hourly = null;
			body.pressure_history = null;
			body.air_hourly = null;
		}
		res.end(JSON.stringify(body));
		return;
	}
	if (today.has(file)) {
		const days = Math.floor((Date.now() / 1000 - recorded[file]) / 86400);
		res.end(JSON.stringify(moved(read(file), days * 86400)));
		return;
	}
	if (!added[key]) {
		res.end(readFileSync(join(dir, file)));
		return;
	}
	const body = read(file);
	for (const extra of added[key]) {
		const extraBody = read(extra);
		body.features.push(...extraBody.features);
		if (extraBody.metadata?.disclaimer && body.metadata && !body.metadata.disclaimer) {
			body.metadata.disclaimer = extraBody.metadata.disclaimer;
		}
	}
	res.end(JSON.stringify(body));
}).listen(port, '127.0.0.1', () => console.log(`mock Vigie API on http://127.0.0.1:${port}`));
