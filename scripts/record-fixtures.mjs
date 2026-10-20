// Records real answers of a Vigie API instance into e2e/fixtures/, for the unit and end-to-end tests.
//   VIGIE_API_URL=http://127.0.0.1:8080 node scripts/record-fixtures.mjs
// The tests never call the network: they replay these files (e2e/mock-api.mjs).
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const api = (process.env.VIGIE_API_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const out = join(import.meta.dirname, '..', 'e2e', 'fixtures');
const countries = ['FR', 'DE', 'BE', 'ES', 'IT', 'GB', 'US', 'CA', 'NZ'];

const targets = [
	['health', '/v1/health'],
	['providers', '/v1/providers'],
	['hazards', '/v1/geojson/hazards'],
	...countries.map((cc) => [`warnings-${cc}`, `/v1/vigilances.geojson?country=${cc}`])
];

await mkdir(out, { recursive: true });
const index = {};
for (const [name, path] of targets) {
	const response = await fetch(api + path, { headers: { accept: 'application/json' } });
	if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
	const body = await response.json();
	await writeFile(join(out, `${name}.json`), JSON.stringify(body));
	index[path] = `${name}.json`;
	console.log(`${path} -> ${name}.json`);
}
await writeFile(
	join(out, 'index.json'),
	JSON.stringify(
		{ recorded_utc: Math.floor(Date.now() / 1000), source: 'a Vigie API instance', paths: index },
		null,
		1
	)
);
