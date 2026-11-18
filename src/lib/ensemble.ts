// The ensemble forecast of Météo-France (PE-AROME) of a point, ready to draw: one bar per window of three hours for the
// chance of 1 mm of rain, and a few chips for the rest. Pure, so that the card and the tests share it.
// A chance for the area around the point, never a warning: it never enters the level of a place.
import type { Lang } from './i18n';
import type { EnsembleWindow, PointWeather } from './types';

/** The chips only show a chance of at least this much (%): below it the signal is not worth a line. */
export const CHIP_MIN_PCT = 10;
/** A bar or a chip at least this high (%) is drawn stronger. */
export const HIGH_MIN_PCT = 50;
/** At most this many windows: the next 24 hours. */
export const MAX_WINDOWS = 8;

export interface EnsembleBar {
	/** The end of the three hours, in the place's time: minutes since midnight, 0 to 1439. */
	endMinutes: number;
	/** The chance of 1 mm of rain or more in the three hours, %. */
	rain1Pct: number | null;
	high: boolean;
}

export type EnsembleChipKind = 'rain5' | 'gust' | 'storm' | 'hail' | 'snow';

export interface EnsembleChip {
	kind: EnsembleChipKind;
	pct: number;
	/** `rain5`: the end of the window of the highest chance ("around"); `gust`: the end of the last window at the threshold ("until"). */
	atMinutes: number | null;
	/** Strong enough to be marked (a gust, a storm or hail at half or more). */
	strong: boolean;
}

export interface EnsembleView {
	bars: EnsembleBar[];
	chips: EnsembleChip[];
	runUtc: number | null;
}

/** Minutes since midnight at the place for an instant (UTC seconds). */
export function placeMinutes(unix: number, utcOffsetS: number): number {
	const day = 24 * 60;
	return ((Math.round((unix + utcOffsetS) / 60) % day) + day) % day;
}

/** "6 h" / "5 h 30" in French, "06:00" / "05:30" in English. */
export function hourLabel(lang: Lang, minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (lang === 'fr') return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "48 %" in French (non-breaking space), "48%" in English. */
export const percent = (lang: Lang, value: number): string => (lang === 'fr' ? `${value} %` : `${value}%`);

type Field = 'rain5Pct' | 'gust30ktPct' | 'stormPct' | 'hailPct' | 'snowPct';
const CHIPS: {
	kind: EnsembleChipKind;
	field: Field;
	at: 'peak' | 'last' | null;
	strongFrom: number | null;
}[] = [
	{ kind: 'rain5', field: 'rain5Pct', at: 'peak', strongFrom: null },
	{ kind: 'gust', field: 'gust30ktPct', at: 'last', strongFrom: HIGH_MIN_PCT },
	{ kind: 'storm', field: 'stormPct', at: null, strongFrom: HIGH_MIN_PCT },
	{ kind: 'hail', field: 'hailPct', at: null, strongFrom: HIGH_MIN_PCT },
	{ kind: 'snow', field: 'snowPct', at: null, strongFrom: null }
];

/**
 * What to draw, or null when there is nothing to show: no block, no window, or no time zone for the place (the hours are
 * the place's, never guessed).
 */
export function ensembleView(
	probabilities: PointWeather['probabilities'],
	utcOffsetS: number | null
): EnsembleView | null {
	if (!probabilities || utcOffsetS == null) return null;
	const windows: EnsembleWindow[] = probabilities.windows.slice(0, MAX_WINDOWS);
	if (windows.length === 0) return null;
	const bars = windows.map((w) => ({
		endMinutes: placeMinutes(w.to, utcOffsetS),
		rain1Pct: w.rain1Pct,
		high: (w.rain1Pct ?? 0) >= HIGH_MIN_PCT
	}));
	const chips: EnsembleChip[] = [];
	for (const spec of CHIPS) {
		let max: number | null = null;
		let peak = -1;
		let last = -1;
		windows.forEach((w, i) => {
			const v = w[spec.field];
			if (v == null) return;
			if (max == null || v > max) {
				max = v;
				peak = i;
			}
			if (v >= CHIP_MIN_PCT) last = i;
		});
		if (max == null || max < CHIP_MIN_PCT) continue;
		const index = spec.at === 'peak' ? peak : spec.at === 'last' ? last : -1;
		chips.push({
			kind: spec.kind,
			pct: max,
			atMinutes: index >= 0 ? bars[index].endMinutes : null,
			strong: spec.strongFrom != null && max >= spec.strongFrom
		});
	}
	return { bars, chips, runUtc: probabilities.runUtc };
}
