// A count of the requests that cost the API's weather sources something, over a sliding window. The Vigie
// API holds Open-Meteo to its published quota, but that quota is shared by everything on the same address
// (at home: the displays and Home Assistant too). The site keeps its own part of it bounded, so that
// visitors asking for many places cannot use up the weather of the displays.

export class SlidingBudget {
	private times: number[] = [];

	constructor(
		private readonly limit: number,
		private readonly windowMs = 86_400_000,
		private readonly now: () => number = Date.now
	) {}

	private prune(now: number): void {
		const start = now - this.windowMs;
		let drop = 0;
		while (drop < this.times.length && this.times[drop] <= start) drop++;
		if (drop) this.times.splice(0, drop);
	}

	/** Counts one request and returns true, or returns false when the window is full. */
	take(): boolean {
		const now = this.now();
		this.prune(now);
		if (this.times.length >= this.limit) return false;
		this.times.push(now);
		return true;
	}

	used(): number {
		this.prune(this.now());
		return this.times.length;
	}
}
