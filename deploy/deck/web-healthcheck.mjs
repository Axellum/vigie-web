// Health of Vigie Web inside its container: exit 0 when a page answers 2xx. (A quadlet HealthCmd with
// quotes is mangled, hence this file mounted read-only.)
// The server reads the visitor's address in X-Forwarded-For (ADDRESS_HEADER) and answers 500 without it:
// Caddy always adds it, this check has to say it itself.
const response = await fetch('http://127.0.0.1:3000/about', {
	headers: { 'x-forwarded-for': '127.0.0.1' },
	signal: AbortSignal.timeout(4000)
}).catch(() => null);
process.exit(response?.ok ? 0 : 1);
