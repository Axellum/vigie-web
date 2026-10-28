// The tide of one position, loaded in the browser from `/data/tides.json` and kept until the position changes. `none` where the
// tide model has no point near (inland, a 204): the tide is not a thing to report missing there.
import type { TideCurve } from './tides';

type TideState = { key: string; status: 'loading' | 'ok' | 'none' | 'error'; value?: TideCurve };

export class TideAt {
	state = $state<TideState | null>(null);
	/** When the curve came: the "now" of its view. */
	loadedAt = $state(Math.floor(Date.now() / 1000));
	readonly value = $derived(this.state?.status === 'ok' ? (this.state.value ?? null) : null);
	readonly none = $derived(this.state?.status === 'none');

	/** Load the tide of `at` unless it is the one already asked. Call it untracked from an effect. */
	follow(at: { lat: number; lon: number } | null) {
		if (!at) return;
		const key = `${at.lat},${at.lon}`;
		if (this.state?.key !== key) void this.#load(key, at.lat, at.lon);
	}

	async #load(key: string, lat: number, lon: number) {
		this.state = { key, status: 'loading' };
		try {
			const response = await fetch(`/data/tides.json?lat=${lat}&lon=${lon}`);
			if (this.state?.key !== key) return;
			if (response.status === 204) {
				this.state = { key, status: 'none' };
				return;
			}
			if (!response.ok) throw new Error(String(response.status));
			const value = (await response.json()) as TideCurve;
			if (this.state?.key !== key) return;
			this.loadedAt = Math.floor(Date.now() / 1000);
			this.state = { key, status: 'ok', value };
		} catch {
			if (this.state?.key === key) this.state = { key, status: 'error' };
		}
	}
}
