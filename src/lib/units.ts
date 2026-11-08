// The units a person chose for what the cards show (temperature, wind, height), in their account. The API and the
// stored data stay in °C, km/h and metres; only what is written on the screen changes. Pure, so that the cards and
// the tests share them. (The sea pages keep their own choice of knots or km/h without an account: sea/units.ts.)
import type { Lang } from './i18n';
import { HEIGHT_UNITS, TEMPERATURE_UNITS, WIND_UNITS, type Prefs, type Units } from './prefs';

export type { Units } from './prefs';

/** What nothing chosen means: what the site has always shown, in both languages. */
export const DEFAULT_UNITS: Units = { temperature: 'c', wind: 'kmh', height: 'm' };

/** The units of a person: each one chosen, else the default. */
export function unitsOf(prefs: Prefs | null | undefined): Units {
	return { ...DEFAULT_UNITS, ...prefs?.units };
}

/** Whether these are the units the site shows when nobody chose. */
export const isDefault = (u: Units): boolean =>
	u.temperature === DEFAULT_UNITS.temperature &&
	u.wind === DEFAULT_UNITS.wind &&
	u.height === DEFAULT_UNITS.height;

const KMH_PER_MS = 3.6;
const KMH_PER_KN = 1.852; // the nautical mile is 1852 m, by definition
const KMH_PER_MPH = 1.609344; // the international mile, by definition
const FT_PER_M = 1 / 0.3048; // the international foot, by definition

/** A temperature given in °C, in the unit chosen. */
export function temperature(celsius: number, unit: Units['temperature']): number {
	return unit === 'f' ? (celsius * 9) / 5 + 32 : celsius;
}

/** A speed given in km/h, in the unit chosen. */
export function speed(kmh: number, unit: Units['wind']): number {
	switch (unit) {
		case 'ms':
			return kmh / KMH_PER_MS;
		case 'kn':
			return kmh / KMH_PER_KN;
		case 'mph':
			return kmh / KMH_PER_MPH;
		default:
			return kmh;
	}
}

/** A height or a distance given in metres, in the unit chosen. */
export function height(metres: number, unit: Units['height']): number {
	return unit === 'ft' ? metres * FT_PER_M : metres;
}

/** The unit as it is written after a figure. */
export const temperatureLabel = (unit: Units['temperature']): string => (unit === 'f' ? '°F' : '°C');
export const heightLabel = (unit: Units['height']): string => (unit === 'ft' ? 'ft' : 'm');
export function speedLabel(lang: Lang, unit: Units['wind']): string {
	switch (unit) {
		case 'ms':
			return 'm/s';
		case 'kn':
			return lang === 'fr' ? 'nœuds' : 'kn';
		case 'mph':
			return 'mph';
		default:
			return 'km/h';
	}
}

export { HEIGHT_UNITS, TEMPERATURE_UNITS, WIND_UNITS };
