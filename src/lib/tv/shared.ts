// What the screen of a personal page shows (`/tv/p/<secret>`, docs/tv.md): one panel for each block of the page that a screen can draw,
// in the order the person set, worked out from the answers of the API for the place of the block. Pure, like `model.ts`: the same
// page, the same answers and the same `now` give the same screen. A figure the API did not give is `null` and the panel says so.
//
// A screen is not the page: it draws four of the eight cards (`TV_CARDS`), the others are left out of the rotation and the person is
// told which (docs/tv.md). The size of a block (s, m, l) means nothing on a television, and the units of the account are not applied
// yet (a screen speaks in °C, knots and metres).
import { number } from '../format';
import type { Lang } from '../i18n';
import type { Card } from '../profiles';
import { compass } from '../surf';
import type { TideCurve } from '../tides';
import type { PointWeather } from '../types';
import { skyLabel } from '../weather';
import type { SharedPage, SharedPlace } from '../server/pageLinks';
import {
	beaufort,
	BEAUFORT_WORD,
	creditOf,
	isDay,
	knots,
	rainView,
	STALE_AFTER_S,
	tideView,
	type Fresh,
	type TvRain,
	type TvSky,
	type TvSwell,
	type TvTide,
	type TvWind
} from './model';
import type { TvParams } from './params';
import { sunWindows } from './sun';
import { tvText, type TvKey } from './text';

/** The cards a screen can draw. The others (the official warnings, the hazards, the surf spots, the sky) are not on a screen yet. */
export const TV_CARDS = ['weather', 'sea', 'tide', 'air'] as const satisfies readonly Card[];
export type TvCard = (typeof TV_CARDS)[number];

/** Whether a screen draws this card. */
export const isTvCard = (card: Card): card is TvCard => (TV_CARDS as readonly string[]).includes(card);

/**
 * The most panels on a screen: a page holds up to 24 blocks, but a panel stays 20 seconds and each place costs a reading of the
 * weather a quarter of an hour, from the share of the television screens (`VIGIE_TV_POINT_LOOKUPS_PER_DAY`).
 */
export const MAX_PANELS = 12;

export interface TvAir {
	/** The European index, as the API gives it. No word is added to it: the API does not give its scale. */
	eaqi: number | null;
	pm25: number | null;
	pm10: number | null;
}

interface PanelBase {
	/** The id of the block (4 to 12 letters and digits, not the secret). */
	id: string;
	place: string;
}

export type SharedPanel =
	| (PanelBase & { card: 'weather'; sky: TvSky | null; wind: TvWind | null; rain: TvRain })
	| (PanelBase & {
			card: 'sea';
			swell: TvSwell | null;
			/** The tile says "waves" when the API gave no separate swell. */
			waves: boolean;
			wind: TvWind | null;
			waterC: number | null;
	  })
	| (PanelBase & { card: 'tide'; tide: TvTide | null })
	| (PanelBase & { card: 'air'; air: TvAir | null });

export interface SharedScreen {
	title: string;
	now: number;
	/** The clock of the screen, seconds to add to UTC: the time of the first place whose offset the API gave; null when none did. */
	offsetS: number | null;
	theme: 'day' | 'night';
	/** The daylight windows of the first place, so that the screen can turn itself to night. */
	windows: [number, number][];
	fresh: number | null;
	stale: boolean;
	/** Something a panel would show was not available. */
	partial: boolean;
	panels: SharedPanel[];
	credit: string;
}

/** What was read for one block: the weather of its place and, for a tide, the tide. A reading that did not answer is null. */
export interface Reading {
	point: Fresh<PointWeather> | null;
	tide: Fresh<TideCurve> | null;
}

export interface SharedInput {
	now: number;
	lang: Lang;
	params: Pick<TvParams, 'theme'>;
	page: SharedPage;
	/** By block id. */
	readings: Map<string, Reading>;
}

/** The blocks a screen draws, in the order of the page, at most `MAX_PANELS`. */
export function drawnBlocks(page: SharedPage): SharedPage['blocks'] {
	return page.blocks.filter((b) => isTvCard(b.type)).slice(0, MAX_PANELS);
}

/** `hh:mm` at a place whose clock is `offsetS` seconds ahead of UTC. */
export function clockAt(t: number, offsetS: number): string {
	const d = new Date((t + offsetS) * 1000);
	return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function windOf(point: PointWeather | null, lang: Lang): TvWind | null {
	const c = point?.current;
	if (!c || c.windKmh == null) return null;
	const kn = knots(c.windKmh);
	const force = kn == null ? null : beaufort(kn);
	return {
		kn,
		gustKn: knots(c.gustKmh),
		deg: c.windDeg,
		force,
		word: force == null ? null : BEAUFORT_WORD[lang][force],
		from: c.windDeg == null ? null : tvText(lang, 'from', { point: compass(lang, c.windDeg) }),
		relative: null,
		bars: []
	};
}

function swellOf(point: PointWeather | null, lang: Lang): TvSwell | null {
	const m = point?.marine;
	if (!m) return null;
	// The swell when the API separates it, else the waves of the sea; both are model values for a cell, not a measurement.
	const swell = m.swellM != null;
	const height = swell ? m.swellM : m.waveM;
	if (height == null) return null;
	const deg = swell ? m.swellDeg : m.waveDeg;
	return {
		m: height,
		periodS: swell ? m.swellPeriodS : m.wavePeriodS,
		from: deg == null ? null : compass(lang, deg),
		bars: []
	};
}

function skyOf(
	point: PointWeather | null,
	place: SharedPlace,
	now: number,
	offsetS: number | null,
	lang: Lang
): TvSky | null {
	const c = point?.current;
	if (!c) return null;
	// The sun of the day at the place, from the equation of `sun.ts`: a time of day only when the clock of the place is known.
	const today =
		offsetS == null
			? null
			: sunWindows(place.lat, place.lon, now).find(([rise, set]) => now < set && set - rise < 86_400);
	return {
		tempC: c.tempC,
		feelsC: c.feelsLikeC,
		label: skyLabel(lang, c.code),
		uv: c.uv,
		waterC: null,
		rise: today && offsetS != null ? clockAt(today[0], offsetS) : null,
		set: today && offsetS != null ? clockAt(today[1], offsetS) : null
	};
}

/** The date as words at a place whose clock is `offsetS` seconds ahead of UTC: `dimanche 8 novembre`. */
export function dateAt(lang: Lang, t: number, offsetS: number): string {
	return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
		timeZone: 'UTC',
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	}).format((t + offsetS) * 1000);
}

/** The offset of the clock of a place, seconds ahead of UTC, from the weather answer; null when the API did not give one. */
const offsetOf = (point: Fresh<PointWeather> | null): number | null => {
	const s = point?.value.utcOffsetS;
	return typeof s === 'number' && Number.isFinite(s) ? s : null;
};

export function buildShared(input: SharedInput): SharedScreen {
	const { now, lang, page, readings } = input;
	const blocks = drawnBlocks(page);

	const offsetS =
		blocks.map((b) => offsetOf(readings.get(b.id)?.point ?? null)).find((o): o is number => o != null) ??
		null;
	const first = blocks[0]?.place;
	const windows = first ? sunWindows(first.lat, first.lon, now) : [];
	const day = input.params.theme === 'auto' ? isDay(windows, [], now) : input.params.theme === 'day';

	const panels: SharedPanel[] = blocks.map((b): SharedPanel => {
		const read = readings.get(b.id) ?? { point: null, tide: null };
		const point = read.point?.value ?? null;
		const base = { id: b.id, place: b.place.name };
		const zone = offsetOf(read.point) ?? offsetS;
		switch (b.type as TvCard) {
			case 'weather':
				return {
					...base,
					card: 'weather',
					sky: skyOf(point, b.place, now, zone, lang),
					wind: windOf(point, lang),
					rain: rainView(read.point, now)
				};
			case 'sea':
				return {
					...base,
					card: 'sea',
					swell: swellOf(point, lang),
					waves: point?.marine?.swellM == null,
					wind: windOf(point, lang),
					waterC: point?.marine?.seaTempC ?? null
				};
			case 'tide':
				return {
					...base,
					card: 'tide',
					// Without the clock of the place the times of the tides would be those of another zone: they are left out.
					tide: tideView(
						read.tide?.value ?? null,
						now,
						lang,
						b.place,
						24,
						zone == null ? () => '–' : (_l, t) => clockAt(t, zone)
					)
				};
			default:
				return {
					...base,
					card: 'air',
					air: point?.air ? { eaqi: point.air.eaqi, pm25: point.air.pm25, pm10: point.air.pm10 } : null
				};
		}
	});

	const all = blocks.flatMap((b) => {
		const r = readings.get(b.id);
		return r ? [r.point, r.tide] : [];
	});
	const answered = all.filter((r): r is Fresh<never> => r != null);
	const fresh = answered.length ? Math.floor(Math.min(...answered.map((r) => r.fetchedAt)) / 1000) : null;
	const credit = creditOf(
		blocks.flatMap((b) => {
			const r = readings.get(b.id);
			if (!r) return [];
			const p = r.point?.value;
			return [
				p?.attribution,
				b.type === 'weather' ? p?.rain?.attribution : null,
				b.type === 'sea' && p?.marine ? p.marine.attribution : null,
				b.type === 'air' ? p?.air?.attribution : null,
				b.type === 'tide' ? r.tide?.value.attribution : null
			];
		})
	);
	return {
		title: page.title,
		now,
		offsetS,
		theme: day ? 'day' : 'night',
		windows,
		fresh,
		stale: answered.some((r) => r.stale) || (fresh != null && now - fresh > STALE_AFTER_S),
		partial: blocks.some((b) => {
			const r = readings.get(b.id);
			return !r?.point || (b.type === 'tide' && !r.tide);
		}),
		panels,
		credit
	};
}

/** The caption of a card, in the language of the page. */
export const cardLabel = (lang: Lang, card: TvCard): string => tvText(lang, `card.${card}` as TvKey);

/** The EAQI and the particles as the screen writes them (a figure the API did not give is a dash). */
export const airFigure = (lang: Lang, v: number | null, digits = 0): string =>
	v == null ? '–' : number(lang, v, digits);
