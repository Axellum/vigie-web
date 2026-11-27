// The pins of the sea map: for each spot that can be judged for the activity chosen, its verdict and the few figures that activity
// is judged on — the swell for the surf, the wind for the kite and the boat, the tide for shore fishing — with the way the tide goes,
// on every pin. The verdicts are the API's (`/v1/activities/overview`), the figures of the current hour too (`/v1/surf/overview`,
// joined by the spot's id); a figure the API did not give is left out, never guessed. Nothing here is for safety.
import type { FeatureCollection } from 'geojson';
import { activityText, type ActivityId, type Verdict } from '../activities';
import { number } from '../format';
import type { Lang } from '../i18n';
import { compass, surfText, type SurfSpotNow } from '../surf';
import type { WindUnit } from './choice';
import { VERDICT_RANK, type SeaRow } from './overview';
import { seaText } from './text';
import { KMH_PER_KN, windText } from './units';

export interface SeaPin {
	id: string;
	name: string;
	lat: number;
	lon: number;
	verdict: Verdict | null;
	/** 0 good, 1 possible, 2 poor, 3 no verdict: where pins would touch, the best is kept. */
	rank: number;
	/** The figures of the current hour for the activity, in a few characters: `1,2 m · 9 s`, `18 nœuds`, `tiers bas`. */
	text: string | null;
	/** Where the wind comes from (degrees from north), drawn as an arrow on the pins of the kite and the boat. */
	windFrom: number | null;
	/** The tide now, on every pin of a spot the tide model reaches. */
	tide: 'rising' | 'falling' | null;
	/** What a screen reader says of the pin: the name, the verdict as a word, the figures. */
	label: string;
}

/** The blue ramp of the surf map (`--surf-q0` to `--surf-q3`, dark: good); -1 for a spot without a verdict. */
export const BAND: Record<Verdict, number> = { good: 3, possible: 2, poor: 0 };
export const bandOf = (v: Verdict | null): number => (v ? BAND[v] : -1);

const rankOf = (v: Verdict | null): number => (v == null ? 3 : VERDICT_RANK[v]);

/** A wind the API gave in km/h, in the unit chosen (`windText` takes knots: the conversion is exact). */
const windOf = (lang: Lang, kmh: number, unit: WindUnit): string => windText(lang, kmh / KMH_PER_KN, unit);

/** The figures a pin shows for an activity, from the current hour of the spot; null when the API gave none of them. */
export function pinText(
	lang: Lang,
	activity: ActivityId,
	now: SurfSpotNow['now'],
	unit: WindUnit
): string | null {
	if (!now) return null;
	if (activity === 'surf') {
		const { height, period } = now.swell;
		if (height == null) return null;
		return period == null
			? `${number(lang, height, 1)} m`
			: `${number(lang, height, 1)} m · ${number(lang, period, 0)} s`;
	}
	if (activity === 'kite' || activity === 'boat') {
		return now.wind.speed == null ? null : windOf(lang, now.wind.speed, unit);
	}
	// Shore fishing: the third of the tide range the water is in, else its height.
	if (!now.tide) return null;
	if (now.tide.stage) return surfText(lang, `stage.${now.tide.stage}`);
	return `${now.tide.height >= 0 ? '+' : ''}${number(lang, now.tide.height, 1)} m`;
}

/**
 * One pin per spot that can be judged for the activity (the rows of `rankSpots`, in their order), with the figures of its
 * current hour when the surf overview has the spot. Without that overview the pins keep their verdict and nothing else.
 */
export function seaPins(
	lang: Lang,
	rows: SeaRow[],
	surf: SurfSpotNow[] | null,
	activity: ActivityId,
	unit: WindUnit
): SeaPin[] {
	const byId = new Map((surf ?? []).map((s) => [s.id, s]));
	const verdictWord = (v: Verdict | null) =>
		v ? activityText(lang, `verdict.${v}`) : activityText(lang, 'unknown');
	return rows.map(({ spot, activity: a }) => {
		const now = byId.get(spot.id)?.now ?? null;
		const text = pinText(lang, activity, now, unit);
		const windFrom = (activity === 'kite' || activity === 'boat') && now ? now.wind.from : null;
		const tide = now?.tide?.trend ?? null;
		const said = [
			`${spot.name} : ${verdictWord(a.verdict).toLowerCase()}`,
			text,
			windFrom != null ? seaText(lang, 'pin.windFrom', { dir: compass(lang, windFrom) }) : null,
			tide ? seaText(lang, `pin.tide.${tide}`) : null
		].filter(Boolean);
		return {
			id: spot.id,
			name: spot.name,
			lat: spot.lat,
			lon: spot.lon,
			verdict: a.verdict,
			rank: rankOf(a.verdict),
			text,
			windFrom,
			tide,
			label: said.join(', ')
		};
	});
}

/** The dots under the pins, one per spot, in the colour of its verdict (MapView's `spots`). */
export function pinFeatures(pins: SeaPin[]): FeatureCollection {
	return {
		type: 'FeatureCollection',
		features: pins.map((p) => ({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
			properties: { id: p.id, name: p.name, q: bandOf(p.verdict) }
		}))
	};
}

/** The room a label takes on screen, in pixels: a guess from its figures, since a label is laid out before it is drawn. */
export function labelSize(pin: Pick<SeaPin, 'text' | 'name' | 'windFrom' | 'tide'>): [number, number] {
	const words = pin.text ?? pin.name;
	return [
		Math.round(26 + Math.min(words.length, 22) * 7.2 + (pin.windFrom != null ? 16 : 0) + (pin.tide ? 14 : 0)),
		26
	];
}

/** The gap kept between two labels and between a label and its dot, in pixels. */
export const LABEL_GAP = 4;
export const LABEL_OFFSET = 9;

/**
 * The pins whose label is drawn: the chosen one first, then the best verdict, and a label that would touch one already kept is
 * left out (its dot stays on the map). `at` gives the dot's position on screen (null: off screen). A label sits on the left of
 * its dot, or on its right where the left would leave the screen.
 */
export function keepLabels<T extends Pick<SeaPin, 'id' | 'rank' | 'text' | 'name' | 'windFrom' | 'tide'>>(
	pins: T[],
	at: (pin: T) => [number, number] | null,
	chosen: string | null
): { pin: T; x: number; y: number; side: 'left' | 'right' }[] {
	const order = [...pins].sort(
		(a, b) => Number(b.id === chosen) - Number(a.id === chosen) || a.rank - b.rank || (a.id < b.id ? -1 : 1)
	);
	const boxes: [number, number, number, number][] = [];
	const kept: { pin: T; x: number; y: number; side: 'left' | 'right' }[] = [];
	for (const pin of order) {
		const xy = at(pin);
		if (!xy) continue;
		const [x, y] = xy;
		const [w, h] = labelSize(pin);
		const side = x - LABEL_OFFSET - w < 0 ? 'right' : 'left';
		const box: [number, number, number, number] =
			side === 'left'
				? [x - LABEL_OFFSET - w, y - h / 2, x + 6, y + h / 2]
				: [x - 6, y - h / 2, x + LABEL_OFFSET + w, y + h / 2];
		const touches = boxes.some(
			(b) =>
				box[0] < b[2] + LABEL_GAP &&
				b[0] < box[2] + LABEL_GAP &&
				box[1] < b[3] + LABEL_GAP &&
				b[1] < box[3] + LABEL_GAP
		);
		if (touches && pin.id !== chosen) continue;
		boxes.push(box);
		kept.push({ pin, x, y, side });
	}
	return kept;
}
