// The sea family of the home map: "should you go?" for every spot, as on the sea page, around the place of "here" when there is
// one. The verdicts and the figures of the hour are read once, when the family is first chosen (`/data/sea.json`, the same for
// everybody); the activity is the one this browser chose last on the sea page, and a new choice is kept for it too. The rows,
// the sentence, the pins and the frame come from the same functions as the sea page (`overview.ts`, `answer.ts`, `map.ts`).
import type { FeatureCollection } from 'geojson';
import type { ActivityId, Verdict } from '../activities';
import type { Box } from '../geo';
import type { Lang } from '../i18n';
import type { SurfSpotNow } from '../surf';
import { answerText } from './answer';
import { DEFAULT_CHOICE, readChoice, updateChoice, type SeaChoice } from './choice';
import { pinFeatures, seaPins, type SeaPin } from './map';
import { answerOf, NEAR_KM, rankSpots, type SeaOverview, type SeaRow, type SeaSpot } from './overview';

export interface SeaFamilyInput {
	lang: Lang;
	/** The place the spots are ranked around (rounded, never sent), or null for all of them. */
	at: { lat: number; lon: number } | null;
}

export class SeaFamily {
	status = $state<'idle' | 'loading' | 'ok' | 'failed'>('idle');
	overview = $state<SeaOverview | null>(null);
	surf = $state<SurfSpotNow[] | null>(null);
	choice = $state<SeaChoice>(DEFAULT_CHOICE);
	/** The spot whose card is open over the map. */
	chosen = $state<string | null>(null);

	#input: () => SeaFamilyInput;

	constructor(input: () => SeaFamilyInput) {
		this.#input = input;
	}
	get lang(): Lang {
		return this.#input().lang;
	}
	get at(): { lat: number; lon: number } | null {
		return this.#input().at;
	}

	/** Reads the verdicts once (again after a failure) and the activity chosen last. */
	async load(fetcher: typeof fetch = fetch): Promise<void> {
		if (this.status === 'loading' || this.status === 'ok') return;
		this.choice = readChoice();
		this.status = 'loading';
		try {
			const res = await fetcher('/data/sea.json');
			if (!res.ok) throw new Error(String(res.status));
			const body = (await res.json()) as { overview: SeaOverview; surf: SurfSpotNow[] | null };
			this.overview = body.overview;
			this.surf = body.surf;
			this.status = 'ok';
		} catch {
			this.status = 'failed';
		}
	}

	choose(id: ActivityId) {
		this.choice = updateChoice({ activity: id });
	}

	readonly active = $derived<ActivityId>(this.choice.activity ?? 'surf');
	readonly rows = $derived<SeaRow[]>(
		this.overview ? rankSpots(this.overview.spots, this.active, this.at) : []
	);
	/** The spots near the place, or all of them without one. */
	readonly near = $derived<SeaRow[]>(
		this.at ? this.rows.filter((r) => r.km != null && r.km <= NEAR_KM) : this.rows
	);
	readonly sentence = $derived<string>(answerText(this.lang, answerOf(this.rows, this.at), this.at != null));
	readonly pins = $derived<SeaPin[]>(
		seaPins(this.lang, this.rows, this.surf, this.active, this.choice.unit, this.choice.beachWind)
	);
	readonly dots = $derived<FeatureCollection>(pinFeatures(this.pins));
	/** What the map shows: the spots near the place (with the place), else every spot. */
	readonly frame = $derived.by((): Box | null => {
		const at = this.at;
		const list = at && this.near.length ? this.near.slice(0, 8) : this.rows;
		if (!list.length) return null;
		const lats = list.map((r) => r.spot.lat).concat(at ? [at.lat] : []);
		const lons = list.map((r) => r.spot.lon).concat(at ? [at.lon] : []);
		return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
	});
	readonly chosenSpot = $derived<SeaSpot | null>(
		this.chosen ? (this.overview?.spots.find((s) => s.id === this.chosen) ?? null) : null
	);
	readonly chosenSurf = $derived<SurfSpotNow | null>(
		this.chosen ? (this.surf?.find((s) => s.id === this.chosen) ?? null) : null
	);

	/** The best verdict of an activity among the spots near the place, else among all of them (the chips of the panel). */
	bestOf(id: ActivityId): Verdict | null {
		if (!this.overview) return null;
		const at = this.at;
		const list = rankSpots(this.overview.spots, id, at);
		const pool = at ? list.filter((r) => r.km != null && r.km <= NEAR_KM) : list;
		return pool[0]?.activity.verdict ?? null;
	}
}
