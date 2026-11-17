// "Is it normal?": the normals (1991-2020) and records of the Météo-France station nearest a place (`GET /v1/climate/normals`,
// the "Fiches climatologiques", ADR 0027 of the API). The site sets the forecast of the day against them: the difference with
// the normal maximum of the month, and whether a record of the month falls. A normal is the mean of a whole month, not of one
// day, and the station can stand at another altitude than the place: the card names the station, its distance and altitude.
import type { Lang } from './i18n';

/** The territories the sheets cover (France and its overseas departments and collectivities). */
export const CLIMATE_COUNTRIES = new Set([
	'FR',
	'GP',
	'MQ',
	'GF',
	'RE',
	'YT',
	'PM',
	'BL',
	'MF',
	'NC',
	'PF',
	'WF'
]);

export interface ClimateValue {
	value: number | null;
	period: string | null;
}

export interface ClimateRecord {
	value: number | null;
	date: string | null;
	/** The first day the station's records count from (a station opened in 2015 has records of ten years only). */
	since: string | null;
}

export interface ClimateResponse {
	status: 'available' | 'outside_coverage';
	month: number;
	station: {
		id: string;
		name: string;
		altitudeM: number;
		distanceKm: number;
		active: boolean;
		recordsUntil: string | null;
	} | null;
	normals: {
		tmax: ClimateValue;
		tmin: ClimateValue;
		tmean: ClimateValue;
		rain: ClimateValue;
		rainDays: ClimateValue;
		frostDays: ClimateValue;
		hotDays: ClimateValue;
		sunshine: ClimateValue;
	} | null;
	records: { tmax: ClimateRecord; tmin: ClimateRecord; rainDay: ClimateRecord; gust: ClimateRecord } | null;
	attribution: string | null;
}

const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

const normal = (v: unknown): ClimateValue => {
	const o = obj(v);
	return { value: num(o.value), period: str(o.period) };
};
const record = (v: unknown): ClimateRecord => {
	const o = obj(v);
	return { value: num(o.value), date: str(o.date), since: str(o.since) };
};

/** Parse `GET /v1/climate/normals`; null only for a malformed answer. */
export function climateFromApi(raw: unknown): ClimateResponse | null {
	const r = obj(raw);
	const status = str(r.status);
	const month = num(r.month);
	if ((status !== 'available' && status !== 'outside_coverage') || month == null) return null;
	const s = obj(r.station);
	const n = r.normals ? obj(r.normals) : null;
	const rec = r.records ? obj(r.records) : null;
	const id = str(s.id);
	const name = str(s.name);
	const altitudeM = num(s.altitude_m);
	const distanceKm = num(s.distance_km);
	return {
		status,
		month,
		station:
			id && name && altitudeM != null && distanceKm != null
				? {
						id,
						name,
						altitudeM,
						distanceKm,
						active: s.active === true,
						recordsUntil: str(s.records_until)
					}
				: null,
		normals: n
			? {
					tmax: normal(n.tmax_mean_c),
					tmin: normal(n.tmin_mean_c),
					tmean: normal(n.tmean_c),
					rain: normal(n.rain_mm),
					rainDays: normal(n.rain_days),
					frostDays: normal(n.frost_days),
					hotDays: normal(n.hot_days),
					sunshine: normal(n.sunshine_h)
				}
			: null,
		records: rec
			? {
					tmax: record(rec.tmax_c),
					tmin: record(rec.tmin_c),
					rainDay: record(rec.rain_day_mm),
					gust: record(rec.gust_ms)
				}
			: null,
		attribution: str(r.attribution)
	};
}

export function isCoveredClimateCountry(cc: string | null | undefined): boolean {
	return !!cc && CLIMATE_COUNTRIES.has(cc.toUpperCase());
}

/** The answer when it has something to show: a station and its temperature normals. */
export function climateShown(value: ClimateResponse | null | undefined): value is ClimateResponse & {
	station: NonNullable<ClimateResponse['station']>;
	normals: NonNullable<ClimateResponse['normals']>;
	records: NonNullable<ClimateResponse['records']>;
} {
	return (
		!!value &&
		value.status === 'available' &&
		!!value.station &&
		!!value.normals &&
		!!value.records &&
		value.normals.tmax.value != null
	);
}

export interface ClimateDay {
	/** The maximum of the day minus the normal maximum of the month (°C). */
	difference: number;
	/** A record of the month the day goes past: heat or cold; never for a station that stopped measuring. */
	record: 'heat' | 'cold' | null;
}

/** The day (its forecast maximum and minimum) set against the month; the same rule as the API's `comparison` (ADR 0027). */
export function climateDay(
	value: ClimateResponse & { normals: NonNullable<ClimateResponse['normals']> },
	tmax: number | null,
	tmin: number | null
): ClimateDay | null {
	const normalMax = value.normals.tmax.value;
	if (tmax == null || normalMax == null) return null;
	const active = value.station?.active === true;
	const heat = value.records?.tmax.value;
	const cold = value.records?.tmin.value;
	let rec: ClimateDay['record'] = null;
	if (active && heat != null && tmax > heat) rec = 'heat';
	else if (active && cold != null && tmin != null && tmin < cold) rec = 'cold';
	return { difference: Math.round((tmax - normalMax) * 10) / 10, record: rec };
}

/**
 * Where a temperature stands on the gauge, from the cold record (0) to the heat record (1), clamped. The gauge is drawn from
 * the records of the month; null when one of them is missing.
 */
export function gaugeAt(
	records: { tmax: ClimateRecord; tmin: ClimateRecord },
	celsius: number | null
): number | null {
	const lo = records.tmin.value;
	const hi = records.tmax.value;
	if (celsius == null || lo == null || hi == null || hi <= lo) return null;
	return Math.min(1, Math.max(0, (celsius - lo) / (hi - lo)));
}

const SMALL = new Set([
	'de',
	'du',
	'des',
	'la',
	'le',
	'les',
	'l',
	'd',
	'sur',
	'sous',
	'en',
	'et',
	'au',
	'aux'
]);

/** "CORTE (20)" → "Corte (20)", "ST-GIRONS" → "St-Girons": the sheets write station names in capitals. */
export function stationName(raw: string): string {
	const parts = raw.toLowerCase().split(/([\s\-'’()]+)/);
	return parts
		.map((part, i) => {
			if (!/\p{L}/u.test(part)) return part;
			// "l'isle", "d'ouessant": the word after an elided article is capitalised; "ploumanac'h" stays one word.
			const afterApostrophe = i >= 2 && /['’]$/.test(parts[i - 1]);
			if (afterApostrophe && parts[i - 2].length > 1) return part;
			if (i > 0 && SMALL.has(part)) return part;
			return part.charAt(0).toUpperCase() + part.slice(1);
		})
		.join('');
}

const MONTHS = {
	fr: [
		'janvier',
		'février',
		'mars',
		'avril',
		'mai',
		'juin',
		'juillet',
		'août',
		'septembre',
		'octobre',
		'novembre',
		'décembre'
	],
	en: [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	]
} as const;

/** "Novembre" / "November": the name of a month, capitalised. */
export function monthName(lang: Lang, month: number): string {
	const name: string = MONTHS[lang][month - 1] ?? '';
	return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "de novembre" / "d'avril" in French, "November" in English. */
export function monthOf(lang: Lang, month: number): string {
	const name = MONTHS[lang][month - 1] ?? '';
	if (lang === 'en') return name;
	return /^[aeiouéè]/.test(name) ? `d’${name}` : `de ${name}`;
}

const TEXT = {
	fr: {
		above: 'Max du jour {value} : {diff}° au-dessus de la normale {month}',
		below: 'Max du jour {value} : {diff}° au-dessous de la normale {month}',
		same: 'Max du jour {value} : dans la normale {month}',
		noDay: 'Normales {month} : {min}° à {max}°',
		recordHeat: 'Record de chaleur du mois battu',
		recordCold: 'Record de froid du mois battu',
		gaugeCold: 'record froid {value} ({year})',
		gaugeNormals: 'normales {min}° à {max}°',
		gaugeHeat: 'record {value} ({year})',
		gaugeLabel:
			'Jauge du mois : du record de froid au record de chaleur, la plage des normales et le maximum du jour',
		heading: '{month} à {station}',
		station: 'Station Météo-France {name}, à {km} km, altitude {alt} m',
		stopped: 'Cette station ne mesure plus depuis le {date} : ses records ne bougent plus.',
		altitude:
			'Si le lieu n’est pas à l’altitude de la station, la température peut y différer de plusieurs degrés.',
		tmax: 'Max moyen',
		tmin: 'Min moyen',
		rain: 'Pluie du mois',
		rainDays: 'Jours de pluie (1 mm ou plus)',
		frostDays: 'Jours de gel',
		hotDays: 'Jours à 30° ou plus',
		sunshine: 'Ensoleillement',
		recordOn: 'record {value} le {date}',
		recordRain: 'record {value} en un jour, le {date}',
		recordGust: 'Rafale record : {value}, le {date}',
		period: 'Normales {period} (moyennes du mois, pas d’un jour), records depuis {since}.',
		sinceOpening: 'l’ouverture de la station',
		days: '{n} j',
		hours: '{n} h'
	},
	en: {
		above: 'Today’s high {value}: {diff}° above the {month} normal',
		below: 'Today’s high {value}: {diff}° below the {month} normal',
		same: 'Today’s high {value}: within the {month} normal',
		noDay: '{month} normals: {min}° to {max}°',
		recordHeat: 'Heat record of the month beaten',
		recordCold: 'Cold record of the month beaten',
		gaugeCold: 'cold record {value} ({year})',
		gaugeNormals: 'normals {min}° to {max}°',
		gaugeHeat: 'record {value} ({year})',
		gaugeLabel:
			'Gauge of the month: from the cold record to the heat record, the range of the normals and today’s high',
		heading: '{month} at {station}',
		station: 'Météo-France station {name}, {km} km away, altitude {alt} m',
		stopped: 'This station stopped measuring on {date}: its records no longer move.',
		altitude:
			'If the place is not at the altitude of the station, the temperature there can differ by several degrees.',
		tmax: 'Mean high',
		tmin: 'Mean low',
		rain: 'Rain of the month',
		rainDays: 'Days of rain (1 mm or more)',
		frostDays: 'Days of frost',
		hotDays: 'Days at 30° or more',
		sunshine: 'Sunshine',
		recordOn: 'record {value} on {date}',
		recordRain: 'record {value} in one day, on {date}',
		recordGust: 'Record gust: {value}, on {date}',
		period: 'Normals {period} (means of the month, not of one day), records since {since}.',
		sinceOpening: 'the station opened',
		days: '{n} d',
		hours: '{n} h'
	}
} as const;

export type ClimateTextKey = keyof (typeof TEXT)['fr'];

export function climateText(
	lang: Lang,
	key: ClimateTextKey,
	vars: Record<string, string | number> = {}
): string {
	let out: string = TEXT[lang][key];
	for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
	return out;
}
