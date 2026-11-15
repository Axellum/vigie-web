// The latest 6-minute observation of the nearest coastal Météo-France station (`GET /v1/surf/spots/{id}/station`).
// Every figure comes from the API; missing values stay null, and fallback statuses are kept honestly.
import { number } from './format';
import type { Lang } from './i18n';
import type { WindUnit } from './sea/choice';
import { KMH_PER_KN, unitLabel } from './sea/units';

export type StationStatus = 'ok' | 'not_configured' | 'unavailable' | 'no_current_reading';
export type ComparisonStatus = 'ok' | 'unavailable' | 'no_matching_hour';
export type RelativeWind = 'offshore' | 'cross-shore' | 'onshore';

export interface CoastalStation {
	id: string;
	name: string;
	commune: string | null;
	lat: number | null;
	lon: number | null;
	altM: number | null;
	kind: string | null;
}

export interface StationMeasure {
	measuredUtc: number | null;
	measuredAt: string | null;
	ageMinutes: number | null;
	windSpeedKmh: number | null;
	windGustKmh: number | null;
	windFromDeg: number | null;
	windRelative: RelativeWind | null;
	airTempC: number | null;
	humidityPct: number | null;
	pressureHpa: number | null;
	precip6mMm: number | null;
}

export interface StationWindComparison {
	status: ComparisonStatus;
	windModel: string | null;
	forecastTimeUtc: number | null;
	modelWindSpeedKmh: number | null;
	speedDiffKmh: number | null;
	modelWindGustKmh: number | null;
	gustDiffKmh: number | null;
	modelWindFromDeg: number | null;
	modelWindRelative: RelativeWind | null;
	directionDiffDeg: number | null;
	regimeMatch: boolean | null;
	stale: boolean;
}

export interface SpotStationReading {
	spotId: string;
	spotName: string | null;
	status: StationStatus;
	station: CoastalStation | null;
	distanceKm: number | null;
	comparable: boolean;
	measure: StationMeasure | null;
	comparison: StationWindComparison | null;
	stale: boolean;
	maxAgeHours: number | null;
	maxComparableKm: number | null;
	note: string | null;
	derived: string[];
	licence: string | null;
	attribution: string | null;
}

const STATUSES = new Set<StationStatus>(['ok', 'not_configured', 'unavailable', 'no_current_reading']);
const COMP_STATUSES = new Set<ComparisonStatus>(['ok', 'unavailable', 'no_matching_hour']);
const RELATIVE = new Set<RelativeWind>(['offshore', 'cross-shore', 'onshore']);

const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const relOf = (v: unknown): RelativeWind | null => {
	const s = str(v);
	return s && RELATIVE.has(s as RelativeWind) ? (s as RelativeWind) : null;
};

function stationInfoFromApi(raw: unknown): CoastalStation | null {
	const s = obj(raw);
	const id = str(s.id);
	const name = str(s.name);
	if (!id || !name) return null;
	return {
		id,
		name,
		commune: str(s.commune),
		lat: num(s.lat),
		lon: num(s.lon),
		altM: num(s.alt_m),
		kind: str(s.kind)
	};
}

function measureFromApi(raw: unknown): StationMeasure | null {
	if (!raw || typeof raw !== 'object') return null;
	const m = obj(raw);
	return {
		measuredUtc: num(m.measured_utc),
		measuredAt: str(m.measured_at),
		ageMinutes: num(m.age_minutes),
		windSpeedKmh: num(m.wind_speed_kmh),
		windGustKmh: num(m.wind_gust_kmh),
		windFromDeg: num(m.wind_from_deg),
		windRelative: relOf(m.wind_relative),
		airTempC: num(m.air_temp_c),
		humidityPct: num(m.humidity_pct),
		pressureHpa: num(m.pressure_hpa),
		precip6mMm: num(m.precip_6m_mm)
	};
}

function comparisonFromApi(raw: unknown): StationWindComparison | null {
	if (!raw || typeof raw !== 'object') return null;
	const c = obj(raw);
	const status = str(c.status);
	if (!status || !COMP_STATUSES.has(status as ComparisonStatus)) return null;
	return {
		status: status as ComparisonStatus,
		windModel: str(c.wind_model),
		forecastTimeUtc: num(c.forecast_time_utc),
		modelWindSpeedKmh: num(c.model_wind_speed_kmh),
		speedDiffKmh: num(c.speed_diff_kmh),
		modelWindGustKmh: num(c.model_wind_gust_kmh),
		gustDiffKmh: num(c.gust_diff_kmh),
		modelWindFromDeg: num(c.model_wind_from_deg),
		modelWindRelative: relOf(c.model_wind_relative),
		directionDiffDeg: num(c.direction_diff_deg),
		regimeMatch: typeof c.regime_match === 'boolean' ? c.regime_match : null,
		stale: c.stale === true
	};
}

/** Parse `GET /v1/surf/spots/{id}/station`, returning null only when the payload is unusable. */
export function spotStationFromApi(raw: unknown): SpotStationReading | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = obj(raw);
	const spotId = str(r.spot_id);
	const status = str(r.status);
	if (!spotId || !status || !STATUSES.has(status as StationStatus)) return null;
	const derived = Array.isArray(r.derived)
		? r.derived.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
		: [];
	return {
		spotId,
		spotName: str(r.spot_name),
		status: status as StationStatus,
		station: stationInfoFromApi(r.station),
		distanceKm: num(r.distance_km),
		comparable: r.comparable === true,
		measure: measureFromApi(r.measure),
		comparison: comparisonFromApi(r.comparison),
		stale: r.stale === true,
		maxAgeHours: num(r.max_age_hours),
		maxComparableKm: num(r.max_comparable_km),
		note: str(r.note),
		derived,
		licence: str(r.licence),
		attribution: str(r.attribution)
	};
}

/** Format a wind speed reported in km/h in the visitor's chosen unit (kn or km/h). */
export function stationWindText(lang: Lang, kmh: number | null, unit: WindUnit): string | null {
	if (kmh == null) return null;
	const val = unit === 'kn' ? kmh / KMH_PER_KN : kmh;
	return `${number(lang, val, 0)} ${unitLabel(lang, unit)}`;
}

/** Format a signed difference in km/h (observed minus forecast) in the visitor's chosen unit. */
export function stationSpeedDiffText(lang: Lang, diffKmh: number | null, unit: WindUnit): string | null {
	if (diffKmh == null) return null;
	const val = Math.round(unit === 'kn' ? diffKmh / KMH_PER_KN : diffKmh);
	const sign = val > 0 ? '+' : '';
	return `${sign}${number(lang, val, 0)} ${unitLabel(lang, unit)}`;
}

const TEXT = {
	fr: {
		title: 'Station météo côtière (6 min)',
		stationAt: '{name}, à {km} km.',
		stationAtCommune: '{name} ({commune}), à {km} km.',
		comparable: 'Assez proche (≤ {max} km) pour refléter le vent local, selon le relief.',
		tooFar: 'À plus de {max} km : le vent sur la plage peut différer sensiblement.',
		measuredAt: 'Mesure de {time} (il y a {age} min)',
		measuredAge: 'Mesure d’il y a {age} min',
		stale: 'Données plus anciennes que d’habitude : la collecte Météo-France n’a pas répondu.',
		notConfigured: 'L’observation côtière à 6 minutes n’est pas activée sur ce serveur Vigie.',
		noCurrentReading: 'Aucune mesure récente (moins de {hours} h) pour cette station.',
		unavailable: 'La station côtière Météo-France ne répond pas pour le moment.',
		wind: 'Vent observé',
		gusts: 'Rafales',
		temp: 'Air',
		humidity: 'Humidité',
		pressure: 'Pression',
		precip: 'Pluie (6 min)',
		compareTitle: 'Comparaison avec la prévision',
		compareModel: 'Prévision {model} à {time}',
		compareDiff: 'Écart observé − prévu',
		compareDir: 'Écart d’orientation : {deg}°',
		regimeSame: 'Même orientation par rapport à la plage',
		regimeDifferent: 'Orientation différente de la prévision',
		compareUnavailable: 'Comparaison indisponible pour le moment.',
		compareNoHour: 'Aucune heure de prévision correspondante pour comparer.',
		derivedNote: 'Distance, exposition relative et écarts avec la prévision sont calculés par Vigie.'
	},
	en: {
		title: 'Coastal weather station (6 min)',
		stationAt: '{name}, {km} km away.',
		stationAtCommune: '{name} ({commune}), {km} km away.',
		comparable: 'Close enough (≤ {max} km) to reflect local wind, depending on terrain.',
		tooFar: 'More than {max} km away: wind at the beach may differ noticeably.',
		measuredAt: 'Measured at {time} ({age} min ago)',
		measuredAge: 'Measured {age} min ago',
		stale: 'Older reading than usual: Météo-France observation feed did not respond.',
		notConfigured: '6-minute coastal station observations are not enabled on this Vigie server.',
		noCurrentReading: 'No recent reading (within {hours} h) for this station.',
		unavailable: 'The Météo-France coastal station is not responding for now.',
		wind: 'Observed wind',
		gusts: 'Gusts',
		temp: 'Air temp',
		humidity: 'Humidity',
		pressure: 'Pressure',
		precip: 'Rain (6 min)',
		compareTitle: 'Comparison with forecast',
		compareModel: 'Forecast {model} at {time}',
		compareDiff: 'Observed − forecast',
		compareDir: 'Direction gap: {deg}°',
		regimeSame: 'Same wind orientation relative to the beach',
		regimeDifferent: 'Different wind orientation from forecast',
		compareUnavailable: 'Forecast comparison unavailable for now.',
		compareNoHour: 'No matching forecast hour to compare against.',
		derivedNote: 'Distance, relative wind exposure and forecast gaps are calculated by Vigie.'
	}
} as const;

export type StationTextKey = keyof (typeof TEXT)['fr'];

export function stationText(
	lang: Lang,
	key: StationTextKey,
	vars: Record<string, string | number> = {}
): string {
	let out: string = TEXT[lang][key];
	for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
	return out;
}
