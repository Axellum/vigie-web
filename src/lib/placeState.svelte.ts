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
import { isCoveredDroughtCountry, type DroughtResponse } from './drought';
import { isCoveredAvalancheCountry, type AvalanchesResponse } from './avalanches';
import { isCoveredCatNatCountry, type CatNatResponse } from './catnat';
import { climateShown, isCoveredClimateCountry, type ClimateResponse } from './climate';
import { pollenPeaks, type PollensResponse } from './pollens';
import { cardOrder, wantsSea, type Profile } from './profiles';
import { warningRow } from './rows';
import { placeSentence, type OfficialState } from './sentence';
import { spotsAround, type SurfOverview } from './surf';
import { TideAt } from './tideAt.svelte';
import { DEFAULT_UNITS, type Units } from './units';
import type { WindMap } from './wind';
import { nearestMeasuredFromWindMap } from './weatherCharts';
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
	hazardsDisclaimer?: string | null;
	/** The countries that have official warnings. */
	served: string[];
	uncovered: UncoveredCountry[];
}

type CountryState = { status: 'loading' | 'ok' | 'error'; data?: WarningsData };

/** One answer of the API about the rounded position, with the position it was asked for. */
type Loaded<T> = { key: string; status: 'loading' | 'ok' | 'error'; value?: T } | null;
type Extra = 'pollens' | 'catnat' | 'avalanches' | 'climate';

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
	// Nearby measured station/buoy (from the site's cached `/data/wind.json`) for honest forecast-vs-measured comparison.
	measuredState = $state<Loaded<WindMap>>(null);
	readonly nearestMeasured = $derived(
		this.place && this.measuredState?.status === 'ok'
			? nearestMeasuredFromWindMap(this.place, this.measuredState.value, 30)
			: null
	);

	// --- VigiEau drought restrictions (FR/DROM only, omitted outside covered zones) ------------------------
	droughtState = $state<{
		key: string;
		status: 'loading' | 'ok' | 'error';
		value?: DroughtResponse | null;
	} | null>(null);
	readonly droughtCovered = $derived(isCoveredDroughtCountry(this.country) || this.w?.drought != null);
	readonly drought = $derived(
		this.droughtCovered &&
			this.droughtState?.status === 'ok' &&
			this.droughtState.value &&
			this.droughtState.value.status !== 'outside_coverage' &&
			this.droughtState.value.status !== 'invalid_query'
			? this.droughtState.value
			: null
	);
	readonly hasDrought = $derived(this.drought != null || (this.droughtCovered && this.w?.drought != null));

	// --- pollen (Europe), recognised natural disasters (France), avalanche bulletins (Alps) ---------------
	// Each is asked only where it can exist; outside, the API's `outside_coverage` hides it too.
	pollensState = $state<Loaded<PollensResponse>>(null);
	catnatState = $state<Loaded<CatNatResponse>>(null);
	avalanchesState = $state<Loaded<AvalanchesResponse>>(null);
	readonly pollens = $derived(
		this.pollensState?.status === 'ok' && this.pollensState.value?.status === 'available'
			? this.pollensState.value
			: null
	);
	readonly pollenPeaks = $derived(this.pollens ? pollenPeaks(this.pollens) : []);
	readonly catnatCovered = $derived(isCoveredCatNatCountry(this.country));
	readonly catnat = $derived(
		this.catnatCovered &&
			this.catnatState?.status === 'ok' &&
			this.catnatState.value &&
			this.catnatState.value.status !== 'outside_coverage'
			? this.catnatState.value
			: null
	);
	// The normals and records of the Météo-France station nearest the place (France and overseas), for the month of the
	// forecast's first day (else the reader's own month).
	climateState = $state<Loaded<ClimateResponse>>(null);
	readonly climateCovered = $derived(isCoveredClimateCountry(this.country));
	readonly climateMonth = $derived.by(() => {
		const first = this.w?.daily[0]?.date;
		const m = first ? Number(first.slice(5, 7)) : NaN;
		return m >= 1 && m <= 12 ? m : new Date().getMonth() + 1;
	});
	readonly climate = $derived.by(() => {
		const v = this.climateCovered && this.climateState?.status === 'ok' ? this.climateState.value : null;
		return climateShown(v) ? v : null;
	});
	readonly avalanchesCovered = $derived(isCoveredAvalancheCountry(this.country));
	readonly avalanches = $derived(
		this.avalanchesCovered &&
			this.avalanchesState?.status === 'ok' &&
			this.avalanchesState.value &&
			(this.avalanchesState.value.status === 'active' ||
				this.avalanchesState.value.status === 'confirmed_none')
			? this.avalanchesState.value
			: null
	);

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
			(c) =>
				(c !== 'tide' || !this.tide.none) &&
				(c !== 'surf' || this.withSurf) &&
				(c !== 'climate' || this.climate != null)
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
	readonly hasFireNear = $derived(this.near.some((n) => n.hazard.nearPlaces?.some((p) => p.kind === 'fire')));
	readonly credits = $derived([
		...this.officialCredits,
		this.near.length ? this.hazardsAttribution : null,
		this.hasFireNear ? this.hazardsDisclaimer : null,
		...(this.w ? pointCredits(this.w) : []),
		this.drought?.attribution ?? null,
		this.catnat?.attribution ?? null,
		this.avalanches?.attribution ?? null,
		this.climate?.attribution ?? null,
		this.pollens?.attribution ?? null,
		this.skyCredit,
		this.tide.value?.attribution ?? null,
		this.nearestMeasured?.attribution ?? null,
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
			const covered = this.droughtCovered;
			if (!at || !covered) {
				if (this.droughtState) this.droughtState = null;
				return;
			}
			const key = `${at.lat},${at.lon}`;
			untrack(() => {
				if (this.droughtState?.key !== key) void this.#loadDrought(key, at);
			});
		});

		for (const [kind, wanted] of [
			['pollens', () => true],
			['catnat', () => this.catnatCovered],
			['avalanches', () => this.avalanchesCovered]
		] as const) {
			$effect(() => {
				const at = this.cell;
				const covered = wanted();
				untrack(() => this.#follow(kind, at && covered ? at : null));
			});
		}
		$effect(() => {
			const at = this.cell;
			const covered = this.climateCovered;
			const month = this.climateMonth;
			untrack(() => this.#follow('climate', at && covered ? at : null, `&month=${month}`));
		});

		$effect(() => {
			const at = this.cell;
			untrack(() => this.tide.follow(at));
		});

		$effect(() => {
			const at = this.cell;
			untrack(() => void this.#loadMeasured(at));
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
	get hazardsDisclaimer(): string | null {
		return this.#input().hazardsDisclaimer ?? null;
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

	/** Ask `/data/<kind>.json` for the rounded position (and `extra` query), once per position; forget it when there is none. */
	async #follow(kind: Extra, at: Place | null, extra = '') {
		const field = `${kind}State` as const;
		if (!at) {
			if (this[field]) this[field] = null;
			return;
		}
		const key = `${at.lat},${at.lon}${extra}`;
		if (this[field]?.key === key) return;
		this[field] = { key, status: 'loading' };
		try {
			const response = await fetch(`/data/${kind}.json?lat=${at.lat}&lon=${at.lon}${extra}`);
			if (!response.ok) throw new Error(String(response.status));
			const value = await response.json();
			if (this[field]?.key === key) this[field] = { key, status: 'ok', value };
		} catch {
			if (this[field]?.key === key) this[field] = { key, status: 'error' };
		}
	}

	async #loadMeasured(at: Place | null) {
		if (!at) {
			if (this.measuredState) this.measuredState = null;
			return;
		}
		const w = Math.max(-180, Math.floor(at.lon - 1));
		const s = Math.max(-90, Math.floor(at.lat - 1));
		const e = Math.min(180, Math.ceil(at.lon + 1));
		const n = Math.min(90, Math.ceil(at.lat + 1));
		const bbox = `${w},${s},${e},${n}`;
		if (this.measuredState?.key === bbox) return;
		this.measuredState = { key: bbox, status: 'loading' };
		try {
			const response = await fetch(`/data/wind.json?bbox=${bbox}`);
			if (!response.ok) throw new Error(String(response.status));
			const value = (await response.json()) as WindMap;
			if (this.measuredState?.key === bbox) this.measuredState = { key: bbox, status: 'ok', value };
		} catch {
			if (this.measuredState?.key === bbox) this.measuredState = { key: bbox, status: 'error' };
		}
	}

	async #loadDrought(key: string, at: Place) {
		this.droughtState = { key, status: 'loading' };
		try {
			const response = await fetch(`/data/drought.json?lat=${at.lat}&lon=${at.lon}`);
			if (!response.ok) throw new Error(String(response.status));
			const value = (await response.json()) as DroughtResponse;
			if (this.droughtState?.key === key) this.droughtState = { key, status: 'ok', value };
		} catch {
			if (this.droughtState?.key === key) this.droughtState = { key, status: 'error' };
		}
	}
}
