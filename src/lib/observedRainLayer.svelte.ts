// The "Observed rain (world, satellite)" layer of a map ($lib/observedRain): off by default until
// the visitor turns it on. Fetches `/data/rain-observed` (cached 5 min on the server) and serves
// NASA GPM IMERG 30-minute satellite precipitation tiles through this site's proxy.
import {
	observedRainOnMap,
	pickObservedRainFrame,
	type ObservedRain,
	type ObservedRainFrame,
	type ObservedRainOnMap
} from './observedRain';

export const OBSERVED_RAIN_KEY = 'vigie-observed-rain';
const REFRESH_MS = 300_000;
const RETRY_MS = 60_000;

/** Reads stored toggle preference; defaults to OFF. */
export function parseObservedRainChoice(raw: string | null): boolean {
	try {
		return (JSON.parse(raw ?? '') as { on?: unknown })?.on === true;
	} catch {
		return false;
	}
}

export class ObservedRainLayer {
	#on = $state(false);
	data = $state<ObservedRain | null>(null);
	status = $state<'idle' | 'loading' | 'ok' | 'failed'>('idle');
	/** Selected frame stamp (`YYYYMMDDHHMM`); null follows the latest available frame. */
	#stamp = $state<string | null>(null);
	#at = 0;

	get on() {
		return this.#on;
	}
	set on(value: boolean) {
		this.#on = value;
		try {
			localStorage.setItem(OBSERVED_RAIN_KEY, JSON.stringify({ on: value }));
		} catch {
			// storage blocked: keep for this visit only
		}
	}

	readonly frames = $derived<ObservedRainFrame[]>(this.data?.status === 'ok' ? this.data.frames : []);

	readonly activeFrame = $derived.by<ObservedRainFrame | null>(() => {
		if (!this.#on) return null;
		return pickObservedRainFrame(this.data, this.#stamp);
	});

	selectFrame(stamp: string) {
		this.#stamp = stamp;
	}

	onMap(credit: string): ObservedRainOnMap | null {
		if (!this.#on) return null;
		return observedRainOnMap(this.data, this.#stamp, credit);
	}

	restore() {
		try {
			this.#on = parseObservedRainChoice(localStorage.getItem(OBSERVED_RAIN_KEY));
		} catch {
			// storage blocked: stay off
		}
	}

	sync() {
		if (!this.#on || this.status === 'loading') return;
		if (typeof document !== 'undefined' && document.hidden) return;
		const age = Date.now() - this.#at;
		if (
			this.status === 'idle' ||
			(this.status === 'failed' && age > RETRY_MS) ||
			(this.status === 'ok' && age > REFRESH_MS)
		) {
			void this.#load();
		}
	}

	async #load() {
		this.status = 'loading';
		this.#at = Date.now();
		try {
			const response = await fetch('/data/rain-observed');
			if (!response.ok) throw new Error(String(response.status));
			this.data = (await response.json()) as ObservedRain;
			this.status = 'ok';
		} catch {
			this.status = this.data ? 'ok' : 'failed';
		}
	}
}
