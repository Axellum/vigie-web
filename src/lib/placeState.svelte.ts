// Everything the site knows about one place, loaded in the browser: the official warnings of the countries around it,
// the hazards within its radius, the weather of its grid point, the tide, the surf spots, and what these say in one
// sentence. "Near me" shows one of these; "My page" shows one per place of the account. The position never goes to
// the server except rounded to the weather grid (`snapToGrid`), exactly as "near me" always did.
//
// The state owns effects (it loads as its input changes): make it while a component is being created, or inside
// `$effect.root` when it is made later (and call the cleanup it returns when the place goes away).
import { untrack } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import type { Feature, FeatureCollection } from 'geojson';
import type { Lang } from './i18n';
import { byLevelThenTime, LEVELS, maxLevel } from './levels';
import {
	circleBox,
	countriesNear,
	countryAt,
	hazardsNear,
	snapToGrid,
	warningsAt,
	type Borders,
	type Place
} from './near';
import { pointCredits } from './credits';
import { cardOrder, wantsSea, type Profile } from './profiles';
import { warningRow } from './rows';
import { placeSentence, type OfficialState } from './sentence';
import { spotsAround, type SurfOverview } from './surf';
import { TideAt } from './tideAt.svelte';
import { DEFAULT_UNITS, type Units } from './units';
import type { Hazard, Level, PointWeather as Weather, UncoveredCountry, WarningsData } from './types';

/** What the state is made of: the place and its settings, and what every visitor loads with the page. */
export interface PlaceInput {
	place: Place | null;
	radiusKm: number;
	profile: Profile | null;
	lang: Lang;
	/** The units the figures are written in; the default ones when the visitor chose none. */
	units?: Units;
	/** Seconds since the epoch, kept right on a long visit. */
	now: number;
	hazards: Hazard[];
	hazardsAttribution: string | null;
	/** The countries that have official warnings. */
	served: string[];
	uncovered: UncoveredCountry[];
}

type CountryState = { status: 'loading' | 'ok' | 'error'; data?: WarningsData };

export class PlaceState {
	readonly #input: () => PlaceInput;

	/** The conditions at sea, asked on a click (the profiles that want the sea ask without one). */
	marine = $state(false);
	/** The credit of the sky card, given by the card once it has loaded. */
	skyCredit = $state<string | null>(null);

	// --- official warnings of the countries around the place -------------------------------------------
	readonly countries = new SvelteMap<string, CountryState>();
	readonly nearCountries = $derived(this.place ? countriesNear(this.place, this.served) : []);
	readonly results = $derived.by(() => {
		const out = new Map<string, ReturnType<typeof warningsAt>>();
		const place = this.place;
		if (!place) return out;
		for (const cc of this.nearCountries) {
			const state = this.countries.get(cc);
			if (state?.data) out.set(cc, warningsAt(state.data, place));
		}
		return out;
	});
	readonly here = $derived(
		[...this.results.values()]
			.flatMap((r) => r.here)
			.sort((a, b) => byLevelThenTime(warningRow(a.warning), warningRow(b.warning)))
	);
	/** The country the place is in, from simplified borders loaded with the first place (100 kB): undefined while they
	 *  load, null outside every covered country. */
	borders = $state<Borders | null>(null);
	readonly country = $derived(this.place && this.borders ? countryAt(this.borders, this.place) : undefined);
	/** Why the API reads no source for that country, when it says (a known reason code only). */
	readonly why = $derived(
		this.country ? (this.uncovered.find((u) => u.country === this.country && u.reasonCode) ?? null) : null
	);
	/** Warnings without an area can only be said to concern the country the place is in. */
	readonly unplaced = $derived(
		[...this.results.entries()]
			.filter(([cc, r]) => cc === this.country && r.unplaced.length > 0)
			.map(([cc, r]) => ({ cc, n: r.unplaced.length }))
	);
	readonly loading = $derived(
		this.nearCountries.filter((cc) => this.countries.get(cc)?.status === 'loading')
	);
	readonly failed = $derived(this.nearCountries.filter((cc) => this.countries.get(cc)?.status === 'error'));
	readonly official = $derived.by((): OfficialState => {
		if (
			this.nearCountries.length === 0 ||
			(this.here.length === 0 &&
				(this.country === null || (this.country !== undefined && !this.served.includes(this.country))))
		)
			return 'nosource';
		if (this.here.length) return 'warnings';
		if (this.loading.length || this.country === undefined) return 'loading';
		if (this.failed.length) return 'failed';
		return this.unplaced.length ? 'unplaced' : 'none';
	});
	readonly officialCredits = $derived([
		...new Set(
			[...this.results.entries()]
				.filter(([, r]) => r.here.length > 0)
				.flatMap(([cc]) => {
					const d = this.countries.get(cc)?.data;
					return d ? [...d.attributions, ...(d.disclaimer ? [d.disclaimer] : [])] : [];
				})
		)
	]);

	// --- hazards around ---------------------------------------------------------------------------------
	readonly near = $derived(this.place ? hazardsNear(this.hazards, this.place, this.radiusKm) : []);

	// --- weather of the grid point ----------------------------------------------------------------------
	weather = $state<{
		key: string;
		status: 'loading' | 'ok' | 'error' | 'budget';
		value?: Weather & { stale?: boolean };
	} | null>(null);
	readonly cell = $derived(this.place ? snapToGrid(this.place) : null);
	readonly withSea = $derived(this.marine || wantsSea(this.profile));
	readonly w = $derived(this.weather?.status === 'ok' ? (this.weather.value ?? null) : null);

	/** The tide of the same rounded position, computed by the API; no card where the model has no point near. */
	readonly tide = new TideAt();

	// --- surf spots around, for the sea profiles --------------------------------------------------------
	surfAll = $state<{ status: 'loading' | 'ok' | 'error'; value?: SurfOverview } | null>(null);
	readonly withSurf = $derived(wantsSea(this.profile));
	readonly surfNear = $derived(
		this.surfAll?.value && this.place
			? spotsAround(this.surfAll.value.spots, this.place, this.radiusKm, 5)
			: []
	);

	// --- the place in one sentence, and its cards -------------------------------------------------------
	readonly sentence = $derived(
		this.place
			? placeSentence({
					lang: this.lang,
					profile: this.profile,
					official: this.official,
					warnings: this.here.map((h) => h.warning),
					hazards: this.near,
					weather: this.w,
					now: this.now,
					units: this.units
				})
			: []
	);
	readonly order = $derived(
		cardOrder(this.profile, this.here.length > 0).filter(
			(c) => (c !== 'tide' || !this.tide.none) && (c !== 'surf' || this.withSurf)
		)
	);

	// --- map ---------------------------------------------------------------------------------------------
	readonly zones = $derived.by((): FeatureCollection => {
		const byShape = new Map<string, { cc: string; shape: string; levels: Level[] }>();
		for (const h of this.here) {
			const { cc, shape, level } = h.warning;
			if (!shape) continue;
			const key = `${cc}:${shape}`;
			const entry = byShape.get(key) ?? { cc, shape, levels: [] };
			entry.levels.push(level as Level);
			byShape.set(key, entry);
		}
		const features: Feature[] = [];
		for (const [key, { cc, shape, levels }] of byShape) {
			const geometry = this.countries.get(cc)?.data?.shapes[shape];
			if (geometry)
				features.push({ type: 'Feature', geometry, properties: { key, level: maxLevel(levels) ?? 'NONE' } });
		}
		const rank = (f: Feature) => LEVELS.length - LEVELS.indexOf(f.properties?.level as Level);
		features.sort((a, b) => rank(a) - rank(b));
		return { type: 'FeatureCollection', features };
	});
	readonly frame = $derived(this.place ? circleBox(this.place, this.radiusKm) : null);
	readonly mapPlace = $derived(this.place ? { ...this.place, radiusKm: this.radiusKm } : null);

	/** The credits of what is shown for the place: the warnings found here, the hazards around, the weather, the sky,
	 *  the tide and the surf spots. */
	readonly credits = $derived([
		...this.officialCredits,
		this.near.length ? this.hazardsAttribution : null,
		...(this.w ? pointCredits(this.w) : []),
		this.skyCredit,
		this.tide.value?.attribution ?? null,
		this.withSurf && this.surfNear.length ? (this.surfAll?.value?.attribution ?? null) : null
	]);

	constructor(input: () => PlaceInput) {
		this.#input = input;

		$effect(() => {
			const wanted = this.nearCountries;
			// The loads read and write the states: untracked, so that a new state does not start them again.
			untrack(() => {
				for (const cc of wanted) void this.#loadCountry(cc);
			});
		});

		$effect(() => {
			if (this.place && !this.borders)
				import('./data/borders.json').then((m) => (this.borders = m.default as unknown as Borders));
		});

		$effect(() => {
			const at = this.cell;
			const sea = this.withSea;
			if (!at) return;
			const key = `${at.lat},${at.lon},${sea}`;
			untrack(() => {
				if (this.weather?.key !== key) void this.#loadWeather(key, at, sea);
			});
		});

		$effect(() => {
			const at = this.cell;
			untrack(() => this.tide.follow(at));
		});

		$effect(() => {
			if (!this.withSurf || !this.place) return;
			untrack(() => {
				if (this.surfAll && this.surfAll.status !== 'error') return;
				this.surfAll = { status: 'loading' };
				fetch('/data/surf.json')
					.then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
					.then((value: SurfOverview) => (this.surfAll = { status: 'ok', value }))
					.catch(() => (this.surfAll = { status: 'error' }));
			});
		});
	}

	get place(): Place | null {
		return this.#input().place;
	}
	get radiusKm(): number {
		return this.#input().radiusKm;
	}
	get profile(): Profile | null {
		return this.#input().profile;
	}
	get lang(): Lang {
		return this.#input().lang;
	}
	get units(): Units {
		return this.#input().units ?? DEFAULT_UNITS;
	}
	get now(): number {
		return this.#input().now;
	}
	get hazards(): Hazard[] {
		return this.#input().hazards;
	}
	get hazardsAttribution(): string | null {
		return this.#input().hazardsAttribution;
	}
	get served(): string[] {
		return this.#input().served;
	}
	get uncovered(): UncoveredCountry[] {
		return this.#input().uncovered;
	}

	async #loadCountry(cc: string) {
		const previous = this.countries.get(cc);
		if (previous && previous.status !== 'error') return;
		this.countries.set(cc, { status: 'loading' });
		try {
			const response = await fetch(`/data/warnings/${cc}.json`);
			if (!response.ok) throw new Error(String(response.status));
			this.countries.set(cc, { status: 'ok', data: (await response.json()) as WarningsData });
		} catch {
			this.countries.set(cc, { status: 'error' });
		}
	}

	async #loadWeather(key: string, at: Place, sea: boolean) {
		this.weather = { key, status: 'loading' };
		try {
			const response = await fetch(`/data/point.json?lat=${at.lat}&lon=${at.lon}${sea ? '&marine=1' : ''}`);
			if (response.status === 503) {
				const body = await response.json().catch(() => ({}));
				if (body?.reason === 'budget') {
					if (this.weather?.key === key) this.weather = { key, status: 'budget' };
					return;
				}
			}
			if (!response.ok) throw new Error(String(response.status));
			const value = await response.json();
			if (this.weather?.key === key) this.weather = { key, status: 'ok', value };
		} catch {
			if (this.weather?.key === key) this.weather = { key, status: 'error' };
		}
	}
}
