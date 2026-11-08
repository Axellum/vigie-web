// How "near me" and "my page" write what they show for a place: coordinates in the reader's language, kilometres,
// a figure with its unit, a signed height, an hour and a day. Pure, so that the cards and the tests share them.
import { number } from './format';
import type { Lang } from './i18n';
import {
	DEFAULT_UNITS,
	height,
	heightLabel,
	speed,
	speedLabel,
	temperature,
	temperatureLabel,
	type Units
} from './units';

/** `units`: the figures the API gives in °C, km/h and metres, written in the units the person chose. */
export function placeFormat(lang: Lang, units: Units = DEFAULT_UNITS) {
	const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
	const coord = (value: number, positive: string, negative: string) =>
		`${number(lang, Math.abs(value), 3)}° ${value >= 0 ? positive : negative}`;
	return {
		coord,
		/** "43,660° N, 1,440° O": the position of a place that has no name. */
		where: (p: { lat: number; lon: number }) =>
			`${coord(p.lat, 'N', 'S')}, ${coord(p.lon, 'E', lang === 'fr' ? 'O' : 'W')}`,
		km: (value: number) => number(lang, value, value < 10 ? 1 : 0),
		unit: (value: number | null | undefined, u: string, digits = 1) =>
			value == null ? '–' : `${number(lang, value, digits)} ${u}`,
		/** A height above the mean level, signed: "+0,50 m". */
		signed: (h: number) =>
			`${h > 0 ? '+' : ''}${number(lang, height(h, units.height), 2)} ${heightLabel(units.height)}`,
		/** A temperature given in °C: "16,6 °C" or "61,9 °F". */
		temp: (c: number | null | undefined, digits = 1) =>
			c == null
				? '–'
				: `${number(lang, temperature(c, units.temperature), digits)} ${temperatureLabel(units.temperature)}`,
		/** The figure of a temperature given in °C, without its unit: for "14° / 20°". */
		deg: (c: number | null | undefined, digits = 0) =>
			c == null ? '–' : number(lang, temperature(c, units.temperature), digits),
		/** A wind or a current given in km/h: "11 km/h", "6 nœuds". */
		wind: (kmh: number | null | undefined, digits = 0) =>
			kmh == null ? '–' : `${number(lang, speed(kmh, units.wind), digits)} ${speedLabel(lang, units.wind)}`,
		/** A height of water given in metres: "1,8 m" or "5,9 ft". */
		length: (m: number | null | undefined, digits = 1) =>
			m == null ? '–' : `${number(lang, height(m, units.height), digits)} ${heightLabel(units.height)}`,
		/** The hour of a time in seconds, in the reader's own time zone. */
		hour: (t: number) =>
			new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(t * 1000)),
		/** The day of a calendar date (YYYY-MM-DD), read as UTC so that it never shifts. */
		day: (date: string) =>
			new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(
				new Date(`${date}T12:00:00Z`)
			)
	};
}
