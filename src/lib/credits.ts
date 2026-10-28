// What a page says of its sources: the credits they ask for, and the sources of a country's warnings in the
// reader's words. The credits are shown as the API gives them; the API's coverage `note` is written for the
// developers who use it, in English, and the pages leave it out.
import { number } from './format';
import { t, type Lang } from './i18n';
import type { Coverage, PointWeather } from './types';

/** One line per credit: the API joins several with " | "; empty and repeated ones are left out. */
export function creditLines(credits: (string | null | undefined)[]): string[] {
	const lines = credits.flatMap((c) => (c ? c.split(' | ').map((part) => part.trim()) : []));
	return [...new Set(lines.filter(Boolean))];
}

/** The credits of the weather of a point, block by block, and the disclaimer NASA asks for its fires. */
export function pointCredits(weather: PointWeather): (string | null)[] {
	return [
		weather.attribution,
		weather.rain?.attribution ?? null,
		weather.air?.attribution ?? null,
		weather.river?.attribution ?? null,
		weather.fires?.attribution ?? null,
		weather.marine?.attribution ?? null,
		weather.space?.attribution ?? null,
		weather.fires?.disclaimer ?? null
	];
}

const SOURCE_NAMES: Record<string, Record<Lang, string>> = {
	meteoalarm: { fr: 'MeteoAlarm', en: 'MeteoAlarm' },
	vigicrues: { fr: 'Vigicrues', en: 'Vigicrues' },
	dwd: { fr: 'Deutscher Wetterdienst (DWD)', en: 'Deutscher Wetterdienst (DWD)' },
	eccc: { fr: 'Environnement et Changement climatique Canada', en: 'Environment and Climate Change Canada' },
	metservice: { fr: 'MetService', en: 'MetService' },
	noaa_nws: { fr: 'NOAA National Weather Service', en: 'NOAA National Weather Service' },
	tsunami: {
		fr: 'Centres d’alerte aux tsunamis des États-Unis (tsunami.gov)',
		en: 'U.S. Tsunami Warning Centers (tsunami.gov)'
	},
	swic: {
		fr: 'Service météorologique national (registre de l’OMM)',
		en: 'National meteorological service (WMO registry)'
	}
};

/** The name of a source of warnings (`coverage[].source`); an unknown one keeps the API's id. */
export function sourceName(lang: Lang, source: string): string {
	return SOURCE_NAMES[source]?.[lang] ?? source;
}

/** How many warnings a source lists for the country, and how many of them have no outline; null when unknown. */
export function coverageCount(lang: Lang, c: Coverage): string | null {
	if (c.status === 'unavailable' || c.warningsInFeed == null) return null;
	const count = t(lang, 'country.inFeed', { n: number(lang, c.warningsInFeed, 0) });
	return c.warningsNotMatchable
		? `${count}, ${t(lang, 'country.notMatchable', { n: number(lang, c.warningsNotMatchable, 0) })}`
		: count;
}
