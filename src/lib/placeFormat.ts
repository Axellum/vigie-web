// How "near me" and "my page" write what they show for a place: coordinates in the reader's language, kilometres,
// a figure with its unit, a signed height, an hour and a day. Pure, so that the cards and the tests share them.
import { number } from './format';
import type { Lang } from './i18n';

export function placeFormat(lang: Lang) {
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
		signed: (h: number) => `${h > 0 ? '+' : ''}${number(lang, h, 2)} m`,
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
