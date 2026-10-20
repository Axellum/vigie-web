// A per-address request budget, kept in memory (one server process). The site is cheap to serve, but a
// script hammering it would also hammer the API through the cache misses of rare keys.
import { env } from '$env/dynamic/private';

const WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; start: number }>();

function limit(): number {
	const value = Number(env.VIGIE_RATE_LIMIT_PER_MINUTE);
	return Number.isFinite(value) && value > 0 ? value : 240;
}

/** Whether this address may make one more request now. Static files are not counted. */
export function allow(address: string, path: string, now = Date.now()): boolean {
	if (
		path.startsWith('/_app/') ||
		path.startsWith('/fonts/') ||
		/\.(png|svg|ico|webmanifest|txt)$/.test(path)
	) {
		return true;
	}
	let bucket = buckets.get(address);
	if (!bucket || now - bucket.start >= WINDOW_MS) {
		bucket = { count: 0, start: now };
		buckets.set(address, bucket);
		if (buckets.size > 10_000) {
			for (const [key, b] of buckets) if (now - b.start >= WINDOW_MS) buckets.delete(key);
		}
	}
	bucket.count++;
	return bucket.count <= limit();
}
