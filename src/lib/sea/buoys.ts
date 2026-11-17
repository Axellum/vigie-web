// The offshore buoys of Météo-France (vigie-api `GET /v1/sea/buoys`): their latest hourly record, out at sea in the Mediterranean,
// the Bay of Biscay and off the Antilles. What the open sea does, not what a beach gets. This file only reads the API's answer and
// puts it in words; a value the API did not give is left out, never guessed. Nothing here is for safety.
import { compass } from '../surf';
import { number } from '../format';
import type { Lang } from '../i18n';

export interface SeaBuoy {
	id: string;
	name: string;
	lat: number;
	lon: number;
	distanceKm: number | null;
	measured: number;
	waveHeightM: number | null;
	wavePeriodS: number | null;
	waveFromDeg: number | null;
	seaTempC: number | null;
	airTempC: number | null;
	windKmh: number | null;
	gustKmh: number | null;
	windFromDeg: number | null;
	pressureHpa: number | null;
}

export interface SeaBuoys {
	status: 'ok' | 'not_configured' | 'unavailable';
	buoys: SeaBuoy[];
	stale: boolean;
	maxAgeHours: number | null;
	attribution: string | null;
}

const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** A buoy of the answer, or null when it lacks what places it (an id, a name, a position, the date of its record). */
export function seaBuoyFromApi(raw: unknown): SeaBuoy | null {
	const b = obj(raw);
	const id = str(b.id);
	const name = str(b.name);
	const lat = num(b.lat);
	const lon = num(b.lon);
	const measured = num(b.measured_utc);
	if (!id || !name || lat == null || lon == null || measured == null) return null;
	return {
		id,
		name,
		lat,
		lon,
		distanceKm: num(b.distance_km),
		measured,
		waveHeightM: num(b.wave_height_m),
		wavePeriodS: num(b.wave_period_s),
		waveFromDeg: num(b.wave_from_deg),
		seaTempC: num(b.sea_temp_c),
		airTempC: num(b.air_temp_c),
		windKmh: num(b.wind_speed_kmh),
		gustKmh: num(b.wind_gust_kmh),
		windFromDeg: num(b.wind_from_deg),
		pressureHpa: num(b.pressure_hpa)
	};
}

export function seaBuoysFromApi(raw: unknown): SeaBuoys | null {
	const body = obj(raw);
	const status = body.status;
	if (status !== 'ok' && status !== 'not_configured' && status !== 'unavailable') return null;
	const buoys = Array.isArray(body.buoys)
		? body.buoys.map(seaBuoyFromApi).filter((b): b is SeaBuoy => b != null)
		: [];
	return {
		status,
		buoys,
		stale: body.stale === true,
		maxAgeHours: num(body.max_age_hours),
		attribution: str(body.attribution)
	};
}

/** The sea a buoy is in, by where it floats: the page groups them so. */
export type Basin = 'atlantic' | 'mediterranean' | 'overseas';

export function basinOf(b: Pick<SeaBuoy, 'lat' | 'lon'>): Basin {
	if (b.lat < 35 || b.lon < -20) return 'overseas';
	return b.lon > 0 && b.lat < 44.5 ? 'mediterranean' : 'atlantic';
}

const TEXT = {
	fr: {
		page: 'Bouées au large',
		title: 'Les bouées au large',
		intro:
			'Ce que mesurent les bouées de Météo-France en pleine mer, d’heure en heure : la hauteur, la période et la direction des vagues, la température de l’eau, le vent et la pression. Elles flottent à 30 à 100 km des côtes : elles disent ce que fait le large, pas ce qui arrive sur une plage.',
		meta: 'Les dernières mesures des bouées de Météo-France au large : vagues, température de la mer, vent et pression, en Méditerranée, dans le golfe de Gascogne et aux Antilles.',
		safety:
			'Des mesures, pas une prévision : la mer peut changer vite. Pour sortir en mer, lisez le bulletin météo marine officiel.',
		'basin.mediterranean': 'Méditerranée',
		'basin.atlantic': 'Atlantique',
		'basin.overseas': 'Outre-mer',
		waves: 'Vagues',
		wavesValue: '{height} m',
		period: 'période {s} s',
		from: 'de {dir}',
		noWaves: 'pas de mesure des vagues',
		sea: 'Eau',
		air: 'Air',
		wind: 'Vent',
		windValue: '{speed} km/h',
		gust: 'rafales {gust} km/h',
		pressure: 'Pression',
		pressureValue: '{hpa} hPa',
		measured: 'mesuré à {time}',
		buoy: 'Bouée {name}',
		none: 'Aucune bouée n’a envoyé de mesure ces {hours} dernières heures.',
		unavailable: 'Les bouées ne répondent pas pour le moment.',
		unavailableHint: 'Réessayez dans quelques minutes ; aucune mesure n’est inventée.',
		notConfigured: 'Les bouées ne sont pas branchées sur cette installation de Vigie.',
		stale: 'Ces mesures n’ont pas pu être relues : ce sont les dernières reçues.',
		back: 'La mer',
		seaPageLink: 'Les bouées au large : vagues, eau et vent mesurés en pleine mer'
	},
	en: {
		page: 'Offshore buoys',
		title: 'The offshore buoys',
		intro:
			'What the buoys of Météo-France measure out at sea, hour by hour: the height, period and direction of the waves, the water temperature, the wind and the pressure. They float 30 to 100 km off the coast: they tell what the open sea does, not what reaches a beach.',
		meta: 'The latest records of Météo-France’s offshore buoys: waves, sea temperature, wind and pressure, in the Mediterranean, the Bay of Biscay and the Antilles.',
		safety:
			'Measures, not a forecast: the sea can change fast. Before going to sea, read the official marine weather bulletin.',
		'basin.mediterranean': 'Mediterranean',
		'basin.atlantic': 'Atlantic',
		'basin.overseas': 'Overseas',
		waves: 'Waves',
		wavesValue: '{height} m',
		period: 'period {s} s',
		from: 'from {dir}',
		noWaves: 'no wave measure',
		sea: 'Water',
		air: 'Air',
		wind: 'Wind',
		windValue: '{speed} km/h',
		gust: 'gusts {gust} km/h',
		pressure: 'Pressure',
		pressureValue: '{hpa} hPa',
		measured: 'measured at {time}',
		buoy: '{name} buoy',
		none: 'No buoy has sent a record in the last {hours} hours.',
		unavailable: 'The buoys do not answer at the moment.',
		unavailableHint: 'Try again in a few minutes; no measure is made up.',
		notConfigured: 'The buoys are not connected on this installation of Vigie.',
		stale: 'These records could not be read again: they are the last ones received.',
		back: 'The sea',
		seaPageLink: 'The offshore buoys: waves, water and wind measured out at sea'
	}
} as const;

/** The texts of the buoys page, so that a test can check that both languages have every one. */
export const BUOYS_TEXT = TEXT;

export function buoysText(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
	const table = TEXT[lang] as Record<string, string>;
	let text = table[key] ?? (TEXT.fr as Record<string, string>)[key] ?? key;
	for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
	return text;
}

/** The height of the waves of a buoy (`2,3 m`), or null when it measured none. */
export function waveHeight(lang: Lang, b: SeaBuoy): string | null {
	return b.waveHeightM == null
		? null
		: buoysText(lang, 'wavesValue', { height: number(lang, b.waveHeightM, 1) });
}

/** What goes with the height (`période 6 s · de OSO`), or null when the buoy gave neither. */
export function waveDetails(lang: Lang, b: SeaBuoy): string | null {
	const parts: string[] = [];
	if (b.wavePeriodS != null) parts.push(buoysText(lang, 'period', { s: number(lang, b.wavePeriodS, 0) }));
	if (b.waveFromDeg != null) parts.push(buoysText(lang, 'from', { dir: compass(lang, b.waveFromDeg) }));
	return parts.length ? parts.join(' · ') : null;
}

/** The wind of a buoy in one line (`46 km/h de SO · rafales 61 km/h`), or null when it measured none. */
export function windLine(lang: Lang, b: SeaBuoy): string | null {
	if (b.windKmh == null) return null;
	const parts = [buoysText(lang, 'windValue', { speed: number(lang, b.windKmh, 0) })];
	if (b.windFromDeg != null) parts[0] += ` ${buoysText(lang, 'from', { dir: compass(lang, b.windFromDeg) })}`;
	if (b.gustKmh != null) parts.push(buoysText(lang, 'gust', { gust: number(lang, b.gustKmh, 0) }));
	return parts.join(' · ');
}
