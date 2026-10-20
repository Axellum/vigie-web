// Records real answers of a Vigie API instance into e2e/fixtures/, for the unit and end-to-end tests.
//   VIGIE_API_URL=http://127.0.0.1:8080 node scripts/record-fixtures.mjs           # all of them
//   VIGIE_API_URL=http://127.0.0.1:8080 node scripts/record-fixtures.mjs point     # only these names
// The tests never call the network: they replay these files (e2e/mock-api.mjs).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const api = (process.env.VIGIE_API_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const out = join(import.meta.dirname, '..', 'e2e', 'fixtures');
const countries = ['FR', 'DE', 'BE', 'ES', 'IT', 'GB', 'US', 'CA', 'NZ'];

// [file name, path asked, key the mock answers it under (default: the path)]
const targets = [
	['health', '/v1/health'],
	['providers', '/v1/providers'],
	['hazards', '/v1/geojson/hazards'],
	...countries.map((cc) => [`warnings-${cc}`, `/v1/vigilances.geojson?country=${cc}`]),
	// One weather answer (Corte, Haute-Corse): the mock gives it for every position.
	['point', '/v1/point?lat=42.3&lon=9.15&marine=false&device_type=web&max_hazards=1&radius_km=1', '/v1/point']
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
