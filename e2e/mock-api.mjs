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
const today = new Set(['sky-aurora.json', 'sky-aurora-oval.json']);

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
	for (const extra of added[key]) body.features.push(...read(extra).features);
	res.end(JSON.stringify(body));
}).listen(port, '127.0.0.1', () => console.log(`mock Vigie API on http://127.0.0.1:${port}`));
