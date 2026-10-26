// A stand-in for a browser's push service in the end-to-end tests: it keeps what the site sends to it, and
// the tests read it back (GET /received). A device whose address contains "gone" has unsubscribed: 410.
// It also stands in for Firebase Cloud Messaging: POST /token gives an access token, and a message to
// /v1/projects/<id>/messages:send is kept under the path /fcm/<token>; a token containing "gone": 404.
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
		const body = Buffer.concat(chunks);
		if (req.url === '/token') {
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ access_token: 'mock-access-token', expires_in: 3599, token_type: 'Bearer' }));
			return;
		}
		if (/^\/v1\/projects\/[^/]+\/messages:send$/.test(req.url)) {
			const token = JSON.parse(body.toString('utf-8')).message?.token ?? '';
			if (token.includes('gone')) {
				res.writeHead(404, { 'content-type': 'application/json' });
				res.end(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }));
				return;
			}
			received.push({ path: `/fcm/${token}`, headers: req.headers, body: body.toString('base64') });
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ name: 'projects/vigie-e2e/messages/1' }));
			return;
		}
		if (req.url.includes('gone')) {
			res.writeHead(410);
			res.end();
			return;
		}
		received.push({ path: req.url, headers: req.headers, body: body.toString('base64') });
		res.writeHead(201);
		res.end();
	});
}).listen(port, '127.0.0.1', () => console.log(`mock push service on http://127.0.0.1:${port}`));
