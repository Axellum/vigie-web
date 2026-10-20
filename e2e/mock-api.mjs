// A stand-in for the Vigie API in the end-to-end tests: it replays the answers recorded by
// scripts/record-fixtures.mjs. A country that was not recorded answers 503, like a source that is down.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, 'fixtures');
const port = Number(process.env.MOCK_API_PORT || 18181);
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf-8')).paths;

createServer((req, res) => {
	const url = new URL(req.url, 'http://mock');
	const key =
		url.pathname +
		(url.searchParams.has('country') ? `?country=${url.searchParams.get('country').toUpperCase()}` : '');
	const file = index[key];
	if (!file) {
		res.writeHead(url.pathname.startsWith('/v1/vigilances') ? 503 : 404, {
			'content-type': 'application/json'
		});
		res.end(JSON.stringify({ detail: 'not recorded' }));
		return;
	}
	res.writeHead(200, { 'content-type': 'application/json' });
	res.end(readFileSync(join(dir, file)));
}).listen(port, '127.0.0.1', () => console.log(`mock Vigie API on http://127.0.0.1:${port}`));
