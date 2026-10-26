// A stand-in for a browser's push service in the end-to-end tests: it keeps what the site sends to it, and
// the tests read it back (GET /received). A device whose address contains "gone" has unsubscribed: 410.
import { createServer } from 'node:http';

const port = Number(process.env.MOCK_PUSH_PORT || 18282);
const received = [];

createServer((req, res) => {
	if (req.method === 'GET' && req.url === '/received') {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify(received));
		return;
	}
	if (req.method !== 'POST') {
		res.writeHead(req.url === '/' ? 200 : 405);
		res.end();
		return;
	}
	const chunks = [];
	req.on('data', (chunk) => chunks.push(chunk));
	req.on('end', () => {
		if (req.url.includes('gone')) {
			res.writeHead(410);
			res.end();
			return;
		}
		received.push({ path: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('base64') });
		res.writeHead(201);
		res.end();
	});
}).listen(port, '127.0.0.1', () => console.log(`mock push service on http://127.0.0.1:${port}`));
