// The "Forecast rain (world)" layer of a map ($lib/rainField): off by default until the visitor turns it on.
// Fetches `/data/rain-field` (cached 5 min on the server) and stacks the models (ARPEGE World, ARPEGE Europe, AROME France)
// that reach the current zoom and view for the chosen lead time (+1 h .. +24 h); the legend names the finest of them.
import type { Box } from './geo';
import {
	availableLeadHours,
	pickRainOverlay,
	pickRainStack,
	type RainField,
	type RainFieldFrame,
	type RainFieldLevel,
	type RainFieldOnMap
} from './rainField';

export const RAIN_FIELD_KEY = 'vigie-rain-field';
const REFRESH_MS = 600_000;
const RETRY_MS = 60_000;

/** Reads stored toggle preference; defaults to OFF. */
export function parseRainFieldChoice(raw: string | null): boolean {
	try {
		return (JSON.parse(raw ?? '') as { on?: unknown })?.on === true;
	} catch {
		return false;
	}
}

export class RainFieldLayer {
	#on = $state(false);
	#view = $state<Box | null>(null);
	#zoom = $state(0);
	field = $state<RainField | null>(null);
	status = $state<'idle' | 'loading' | 'ok' | 'failed'>('idle');
	/** Chosen lead time in hours (defaults to the first available, typically +1 h). */
	#lead = $state<number | null>(null);
	#at = 0;

	get on() {
		return this.#on;
	}
	set on(value: boolean) {
		this.#on = value;
		try {
			localStorage.setItem(RAIN_FIELD_KEY, JSON.stringify({ on: value }));
		} catch {
			// storage blocked: keep for this visit only
		}
	}

	readonly leads = $derived(availableLeadHours(this.field));

	readonly leadHours = $derived.by(() => {
		const list = this.leads;
		if (list.length === 0) return this.#lead ?? 1;
		return this.#lead !== null && list.includes(this.#lead) ? this.#lead : list[0];
	});

	setLead(hours: number) {
		this.#lead = hours;
	}

	readonly active = $derived.by<{
		overlay: RainFieldOnMap;
		level: RainFieldLevel;
		frame: RainFieldFrame;
	} | null>(() => {
		if (!this.#on) return null;
		return pickRainOverlay(this.field, this.#view, this.#zoom, this.leadHours, '');
	});

	onMap(credit: string): RainFieldOnMap[] | null {
		if (!this.#on) return null;
		return pickRainStack(this.field, this.#view, this.#zoom, this.leadHours, credit);
	}

	restore() {
		try {
			this.#on = parseRainFieldChoice(localStorage.getItem(RAIN_FIELD_KEY));
		} catch {
			// storage blocked: stay off
		}
	}

	move(view: Box | null, zoom: number) {
		this.#view = view;
		this.#zoom = zoom;
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
			const response = await fetch('/data/rain-field');
			if (!response.ok) throw new Error(String(response.status));
			this.field = (await response.json()) as RainField;
			this.status = 'ok';
		} catch {
			this.status = this.field ? 'ok' : 'failed';
		}
	}
}
