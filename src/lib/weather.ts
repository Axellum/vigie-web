// Labels for the weather values of a point: the WMO weather codes and the wind directions. These words are
// the site's own (the source gives a number); the page says so.
import type { Lang } from './i18n';

const WMO: Record<Lang, Record<number, string>> = {
	fr: {
		0: 'Ciel clair',
		1: 'Plutôt dégagé',
		2: 'Partiellement nuageux',
		3: 'Couvert',
		45: 'Brouillard',
		48: 'Brouillard givrant',
		51: 'Bruine faible',
		53: 'Bruine',
		55: 'Bruine forte',
		56: 'Bruine verglaçante',
		57: 'Bruine verglaçante forte',
		61: 'Pluie faible',
		63: 'Pluie',
		65: 'Pluie forte',
		66: 'Pluie verglaçante',
		67: 'Pluie verglaçante forte',
		71: 'Neige faible',
		73: 'Neige',
		75: 'Neige forte',
		77: 'Grains de neige',
		80: 'Averses faibles',
		81: 'Averses',
		82: 'Averses violentes',
		85: 'Averses de neige',
		86: 'Fortes averses de neige',
		95: 'Orage',
		96: 'Orage avec grêle',
		99: 'Orage avec forte grêle'
	},
	en: {
		0: 'Clear sky',
		1: 'Mainly clear',
		2: 'Partly cloudy',
		3: 'Overcast',
		45: 'Fog',
		48: 'Freezing fog',
		51: 'Light drizzle',
		53: 'Drizzle',
		55: 'Heavy drizzle',
		56: 'Freezing drizzle',
		57: 'Heavy freezing drizzle',
		61: 'Light rain',
		63: 'Rain',
		65: 'Heavy rain',
		66: 'Freezing rain',
		67: 'Heavy freezing rain',
		71: 'Light snow',
		73: 'Snow',
		75: 'Heavy snow',
		77: 'Snow grains',
		80: 'Light showers',
		81: 'Showers',
		82: 'Violent showers',
		85: 'Snow showers',
		86: 'Heavy snow showers',
		95: 'Thunderstorm',
		96: 'Thunderstorm with hail',
		99: 'Thunderstorm with heavy hail'
	}
};

/** The label of a WMO weather code; the code itself when it is not in the table, "–" when unknown. */
export function skyLabel(lang: Lang, code: number | null): string {
	if (code == null) return '–';
	return WMO[lang][code] ?? `WMO ${code}`;
}

const POINTS: Record<Lang, string[]> = {
	fr: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
	en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
};

/** The direction a wind comes from, as one of 8 points; "–" when unknown. */
export function compass(lang: Lang, degrees: number | null): string {
	if (degrees == null) return '–';
	return POINTS[lang][Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}
