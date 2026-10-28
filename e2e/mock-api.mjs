// A stand-in for the Vigie API in the end-to-end tests: it replays the answers recorded by
// scripts/record-fixtures.mjs. A country that was not recorded answers 503, like a source that is down.
// `added` in the index lists answers whose features are added to those of a path (the storms and tsunamis,
// which were not active when the rest was recorded).
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, 'fixtures');
const port = Number(process.env.MOCK_API_PORT || 18181);
const { paths: index, added = {} } = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf-8'));
const read = (file) => JSON.parse(readFileSync(join(dir, file), 'utf-8'));

createServer((req, res) => {
	const url = new URL(req.url, 'http://mock');
	const key =
		url.pathname +
		(url.searchParams.has('country') ? `?country=${url.searchParams.get('country').toUpperCase()}` : '') +
		(url.searchParams.has('source') ? `?source=${url.searchParams.get('source')}` : '') +
		(url.pathname === '/v1/tides'
			? `?lat=${url.searchParams.get('lat')}&lon=${url.searchParams.get('lon')}`
			: '');
	const file = index[key];
	if (!file) {
		res.writeHead(url.pathname.startsWith('/v1/vigilances') ? 503 : 404, {
			'content-type': 'application/json'
		});
		res.end(JSON.stringify({ detail: 'not recorded' }));
		return;
	}
	res.writeHead(200, { 'content-type': 'application/json' });
	if (!added[key]) {
		res.end(readFileSync(join(dir, file)));
		return;
	}
	const body = read(file);
	for (const extra of added[key]) body.features.push(...read(extra).features);
	res.end(JSON.stringify(body));
}).listen(port, '127.0.0.1', () => console.log(`mock Vigie API on http://127.0.0.1:${port}`));
