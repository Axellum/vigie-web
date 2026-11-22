// What the widget page loads in the browser for its place: the official warnings of the countries around it, the weather of its
// cell of the grid and the wind measured around that cell. A lighter cousin of `PlaceState` (no hazards, pollens, drought…): a
// widget stays open for days and reads again every few minutes. The position never goes to the server except rounded to the
// weather grid (`snapToGrid`), exactly as "near me" does.
//
// The state owns effects: make it while a component is being created.
import { untrack } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { byLevelThenTime } from '../levels';
import { countriesNear, countryAt, snapToGrid, warningsAt, type Borders, type Place } from '../near';
import { warningRow } from '../rows';
import type { OfficialState } from '../sentence';
import type { PointWeather, WarningsData } from '../types';
import type { WindMap } from '../wind';
import { windBox } from './model';

type Load<T> = { key: string; status: 'loading' | 'ok' | 'error' | 'budget'; value?: T } | null;

export interface PlaceWidgetInput {
	place: Place | null;
	/** The countries that have official warnings. */
	served: string[];
}

export class PlaceWidget {
	readonly #input: () => PlaceWidgetInput;

	readonly countries = new SvelteMap<string, { status: 'loading' | 'ok' | 'error'; data?: WarningsData }>();
	readonly nearCountries = $derived(this.place ? countriesNear(this.place, this.served) : []);
	readonly here = $derived.by(() => {
		const place = this.place;
		if (!place) return [];
		return this.nearCountries
			.flatMap((cc) => {
				const data = this.countries.get(cc)?.data;
				return data ? warningsAt(data, place).here : [];
			})
			.sort((a, b) => byLevelThenTime(warningRow(a.warning), warningRow(b.warning)));
	});
	borders = $state<Borders | null>(null);
	readonly country = $derived(this.place && this.borders ? countryAt(this.borders, this.place) : undefined);
	readonly official = $derived.by((): OfficialState => {
		if (
			this.nearCountries.length === 0 ||
			(this.here.length === 0 &&
				(this.country === null || (this.country !== undefined && !this.served.includes(this.country))))
		)
			return 'nosource';
		if (this.here.length) return 'warnings';
		const states = this.nearCountries.map((cc) => this.countries.get(cc)?.status);
		if (states.includes('loading') || this.country === undefined) return 'loading';
		if (states.includes('error')) return 'failed';
		return 'none';
	});
	readonly officialCredits = $derived([
		...new Set(
			this.nearCountries.flatMap((cc) => {
				const d = this.countries.get(cc)?.data;
				const holds = this.here.some((h) => h.warning.cc === cc);
				return d && holds ? [...d.attributions, ...(d.disclaimer ? [d.disclaimer] : [])] : [];
			})
		)
	]);

	readonly cell = $derived(this.place ? snapToGrid(this.place) : null);
	weather = $state<Load<PointWeather & { stale?: boolean }>>(null);
	readonly w = $derived(this.weather?.status === 'ok' ? (this.weather.value ?? null) : null);
	wind = $state<Load<WindMap>>(null);

	constructor(input: () => PlaceWidgetInput) {
		this.#input = input;

		$effect(() => {
			const wanted = this.nearCountries;
			untrack(() => {
				for (const cc of wanted) if (!this.countries.has(cc)) void this.#loadCountry(cc);
			});
		});

		$effect(() => {
			if (this.place && !this.borders)
				import('../data/borders.json').then((m) => (this.borders = m.default as unknown as Borders));
		});

		$effect(() => {
			const at = this.cell;
			if (!at) return;
			untrack(() => {
				const key = `${at.lat},${at.lon}`;
				if (this.weather?.key !== key) void this.#loadWeather(key, at);
				if (this.wind?.key !== key) void this.#loadWind(key, at);
			});
		});
	}

	get place(): Place | null {
		return this.#input().place;
	}
	get served(): string[] {
		return this.#input().served;
	}

	/** Read everything again (the site's cache answers when nothing changed). */
	refresh() {
		for (const cc of this.nearCountries) void this.#loadCountry(cc, true);
		const at = this.cell;
		if (!at) return;
		const key = `${at.lat},${at.lon}`;
		void this.#loadWeather(key, at, true);
		void this.#loadWind(key, at, true);
	}

	async #loadCountry(cc: string, again = false) {
		const previous = this.countries.get(cc);
		// A new reading keeps the last good one on screen until it comes.
		if (!again || !previous?.data) this.countries.set(cc, { status: 'loading' });
		try {
			const response = await fetch(`/data/warnings/${cc}.json`);
			if (!response.ok) throw new Error(String(response.status));
			this.countries.set(cc, { status: 'ok', data: (await response.json()) as WarningsData });
		} catch {
			if (!previous?.data) this.countries.set(cc, { status: 'error' });
		}
	}

	async #loadWeather(key: string, at: Place, again = false) {
		const kept = again && this.weather?.key === key && this.weather.value ? this.weather : null;
		if (!kept) this.weather = { key, status: 'loading' };
		try {
			const response = await fetch(`/data/point.json?lat=${at.lat}&lon=${at.lon}`);
			if (response.status === 503) {
				const body = await response.json().catch(() => ({}));
				if (body?.reason === 'budget') {
					if (this.weather?.key === key && !kept) this.weather = { key, status: 'budget' };
					return;
				}
			}
			if (!response.ok) throw new Error(String(response.status));
			const value = await response.json();
			if (this.cell && `${this.cell.lat},${this.cell.lon}` === key)
				this.weather = { key, status: 'ok', value };
		} catch {
			if (this.weather?.key === key && !kept) this.weather = { key, status: 'error' };
		}
	}

	async #loadWind(key: string, at: Place, again = false) {
		const kept = again && this.wind?.key === key && this.wind.value ? this.wind : null;
		if (!kept) this.wind = { key, status: 'loading' };
		try {
			const response = await fetch(`/data/wind.json?bbox=${windBox(at).join(',')}`);
			if (!response.ok) throw new Error(String(response.status));
			const value = (await response.json()) as WindMap;
			if (this.cell && `${this.cell.lat},${this.cell.lon}` === key) this.wind = { key, status: 'ok', value };
		} catch {
			if (this.wind?.key === key && !kept) this.wind = { key, status: 'error' };
		}
	}
}
