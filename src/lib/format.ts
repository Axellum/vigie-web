import { t, type Lang } from './i18n';

const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB' };

/** Date and time in the reader's time zone (the browser's; Europe/Paris when rendered on the server). */
export function dateTime(lang: Lang, unix: number | null, timeZone?: string): string {
	if (unix == null) return '–';
	return new Intl.DateTimeFormat(LOCALE[lang], {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
		timeZone
	}).format(new Date(unix * 1000));
}

export function utc(unix: number | null): string {
	if (unix == null) return '–';
	return new Date(unix * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

/** "3 h ago", "in 20 min", relative to `now` (seconds). */
export function relative(lang: Lang, unix: number | null, now: number): string {
	if (unix == null) return '–';
	const minutes = Math.round((now - unix) / 60);
	const a = Math.abs(minutes);
	const d =
		a < 60
			? t(lang, 'time.min', { n: a })
			: a < 48 * 60
				? t(lang, 'time.h', { n: Math.round(a / 60) })
				: t(lang, 'time.d', { n: Math.round(a / 1440) });
	return minutes >= 0 ? t(lang, 'time.ago', { d }) : t(lang, 'time.in', { d });
}

export function number(lang: Lang, value: number | null, digits = 1): string {
	if (value == null) return '–';
	return value.toLocaleString(LOCALE[lang], { maximumFractionDigits: digits });
}
