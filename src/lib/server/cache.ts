// A small in-memory cache for the answers of the Vigie API.
// - one request per key in flight: concurrent visitors share it;
// - a TTL per entry; a failed refresh serves the last good value, marked stale, rather than an error;
// - a failure with nothing to fall back on is remembered for a short while, so that a down API is not
//   asked once per visitor.

interface Entry<T> {
	value?: T;
	fetchedAt: number;
	expiresAt: number;
	stale?: boolean;
	error?: unknown;
	errorUntil?: number;
	pending?: Promise<Cached<T>>;
}

export interface Cached<T> {
	value: T;
	stale: boolean;
	fetchedAt: number;
}

export class TtlCache {
	private entries = new Map<string, Entry<unknown>>();

	constructor(
		private readonly now: () => number = Date.now,
		private readonly errorTtlMs = 15_000,
		private readonly maxEntries = 200
	) {}

	get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<Cached<T>> {
		const now = this.now();
		let entry = this.entries.get(key) as Entry<T> | undefined;
		if (entry?.value !== undefined && now < entry.expiresAt) {
			return Promise.resolve({ value: entry.value, stale: entry.stale ?? false, fetchedAt: entry.fetchedAt });
		}
		if (entry?.pending) return entry.pending;
		if (entry?.value === undefined && entry?.errorUntil !== undefined && now < entry.errorUntil) {
			return Promise.reject(entry.error);
		}
		if (!entry) {
			entry = { fetchedAt: 0, expiresAt: 0 };
			this.entries.set(key, entry as Entry<unknown>);
			this.evict();
		}
		const current = entry;
		current.pending = load().then(
			(value) => {
				current.value = value;
				current.fetchedAt = this.now();
				current.expiresAt = current.fetchedAt + ttlMs;
				current.stale = false;
				current.error = undefined;
				current.errorUntil = undefined;
				current.pending = undefined;
				return { value, stale: false, fetchedAt: current.fetchedAt };
			},
			(error: unknown) => {
				current.pending = undefined;
				if (current.value !== undefined) {
					// Keep serving the last good value, and try again after a short while.
					current.expiresAt = this.now() + this.errorTtlMs;
					current.stale = true;
					return { value: current.value, stale: true, fetchedAt: current.fetchedAt };
				}
				current.error = error;
				current.errorUntil = this.now() + this.errorTtlMs;
				throw error;
			}
		);
		return current.pending;
	}

	private evict(): void {
		while (this.entries.size > this.maxEntries) {
			const oldest = this.entries.keys().next().value as string;
			this.entries.delete(oldest);
		}
	}
}
