// Turns the Vigie API answers into the site's models. Pure functions: no network, no clock.
// A value the API did not give stays null; nothing is filled in.
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import { geometryBox } from './geo';
import { asLevel } from './levels';
import type {
	Coverage,
	Hazard,
	HazardForecast,
	FireTile,
	HazardsData,
	NearPlace,
	PointWeather,
	ServedCountry,
	UncoveredCountry,
	WarningDetail,
	WarningsData,
	WarningSummary,
	WarningText
} from './types';

type Json = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});

/**
 * The countries the API serves, in its order; an entry with no valid country code is dropped, and so is a
 * country it does not serve (`covered: false`, listed with `?uncovered=true`).
 */
export function servedFromApi(body: unknown): ServedCountry[] {
	if (!Array.isArray(body)) return [];
	const out: ServedCountry[] = [];
	for (const item of body) {
		const o = obj(item);
		const cc = str(o.country)?.toUpperCase();
		if (!cc || !/^[A-Z]{2}$/.test(cc) || o.covered === false) continue;
		out.push({
			country: cc,
			sources: Array.isArray(o.sources) ? o.sources.filter((s): s is string => typeof s === 'string') : [],
			licenceVerified: bool(o.licence_verified) ?? false
		});
	}
	return out;
}

/** The countries the API reads no source for (`covered: false`), with the reason it gives. */
export function uncoveredFromApi(body: unknown): UncoveredCountry[] {
	if (!Array.isArray(body)) return [];
	const out: UncoveredCountry[] = [];
	for (const item of body) {
		const o = obj(item);
		const cc = str(o.country)?.toUpperCase();
		if (!cc || !/^[A-Z]{2}$/.test(cc) || o.covered !== false) continue;
		out.push({ country: cc, reasonCode: str(o.reason_code), reason: str(o.reason) });
	}
	return out;
}

/** Rounds every coordinate of a geometry (3 decimals is about 110 m, enough for a warning area). */
export function roundGeometry(geometry: Geometry, decimals = 3): Geometry {
	const f = 10 ** decimals;
	const round = (c: unknown): unknown =>
		Array.isArray(c) && typeof c[0] === 'number'
			? (c as number[]).map((x) => Math.round(x * f) / f)
			: Array.isArray(c)
				? c.map(round)
				: c;
	if (geometry.type === 'GeometryCollection') {
		return {
			type: 'GeometryCollection',
			geometries: geometry.geometries.map((g) => roundGeometry(g, decimals))
		};
	}
	return { ...geometry, coordinates: round(geometry.coordinates) } as Geometry;
}

/** The places near a hazard; a place without a name is left out (the API never sends one). */
function nearPlacesFromApi(value: unknown): NearPlace[] | null {
	if (!Array.isArray(value)) return null;
	const places: NearPlace[] = [];
	for (const item of value) {
		const p = obj(item);
		const name = str(p.name);
		if (name) places.push({ name, kind: str(p.kind) ?? '', distanceKm: num(p.distance_km) });
	}
	return places;
}

export function hazardsFromApi(body: unknown): HazardsData {
	const collection = obj(body) as Partial<FeatureCollection> & Json;
	const meta = obj(collection.metadata);
	const items: Hazard[] = [];
	for (const feature of (collection.features ?? []) as Feature[]) {
		const p = obj(feature.properties);
		if (!feature.geometry || feature.geometry.type !== 'Point') continue;
		const [lon, lat] = feature.geometry.coordinates as Position;
		const id = str(feature.id) ?? (typeof feature.id === 'number' ? String(feature.id) : null);
		const title = str(p.title);
		if (!id || !title || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
		const source = str(p.source) ?? '';
		items.push({
			id,
			category: str(p.category) ?? 'OTHER',
			level: asLevel(p.severity),
			title,
			source,
			sources: Array.isArray(p.sources)
				? (p.sources.filter((s) => typeof s === 'string') as string[])
				: [source],
			time: num(p.timestamp_utc),
			value: num(p.value_primary),
			unit: str(p.value_unit),
			depthKm: num(p.depth_km),
			tsunami: bool(p.tsunami_warning),
			lon,
			lat,
			attribution: str(p.attribution),
			hasForecast: bool(p.has_forecast) ?? false,
			nearPlaces: nearPlacesFromApi(p.near_places)
		});
	}
	return { generated: num(meta.generated_utc), attribution: str(meta.attribution), items };
}

function textsFromApi(value: unknown): WarningText[] {
	if (!Array.isArray(value)) return [];
	return value.map((t) => {
		const o = obj(t);
		return {
			language: str(o.language) ?? '',
			senderName: str(o.sender_name),
			event: str(o.event),
			headline: str(o.headline),
			description: str(o.description),
			instruction: str(o.instruction)
		};
	});
}

/** The key a warning's shape is stored under: shared by every warning of the same territory. */
export function shapeKey(id: string, geometrySource: string | null): string {
	return geometrySource && geometrySource.startsWith('geocode:') ? geometrySource : `w:${id}`;
}

export interface ParsedWarnings {
	data: WarningsData;
	details: Map<string, WarningDetail>;
}

export function warningsFromApi(cc: string, body: unknown): ParsedWarnings {
	const collection = obj(body) as Partial<FeatureCollection> & Json;
	const meta = obj(collection.metadata);
	const shapes: Record<string, Geometry> = {};
	const warnings: WarningSummary[] = [];
	const details = new Map<string, WarningDetail>();
	const attributions = new Set<string>();

	for (const feature of (collection.features ?? []) as Feature[]) {
		const p = obj(feature.properties);
		const identifier = str(p.identifier);
		if (!identifier) continue;
		const area = obj(p.area);
		// One official message may cover several areas: the API gives one warning per area, all with the
		// message's identifier. The site's id adds the area's first code (or its name).
		const firstCode = Array.isArray(area.geocodes) ? str(obj(area.geocodes[0]).value) : null;
		const areaPart = firstCode ?? slug(str(area.description) ?? '');
		let id = areaPart ? `${identifier}~${areaPart}` : identifier;
		for (let n = 2; details.has(id); n++) id = `${identifier}~${areaPart}~${n}`;
		const geometrySource = str(p.geometry_source);
		let shape: string | null = null;
		let geometry: Geometry | null = null;
		if (feature.geometry) {
			geometry = roundGeometry(feature.geometry);
			shape = shapeKey(id, geometrySource);
			shapes[shape] ??= geometry;
		}
		const texts = textsFromApi(p.texts);
		const attribution = str(p.attribution);
		if (attribution) attributions.add(attribution.split(' | Last update')[0]);
		const summary: WarningSummary = {
			id,
			apiId: typeof feature.id === 'string' && feature.id ? feature.id : null,
			cc,
			source: str(p.source) ?? '',
			level: asLevel(p.level),
			levelOriginal: str(p.level_original),
			phenomenon: str(p.phenomenon),
			area: str(area.description),
			sent: num(p.sent_utc),
			onset: num(p.onset_utc) ?? num(p.effective_utc),
			expires: num(p.expires_utc),
			ends: num(p.ends_utc),
			shape,
			texts: texts.map(({ language, headline, event }) => ({ language, headline, event }))
		};
		warnings.push(summary);
		details.set(id, {
			...summary,
			identifier,
			texts,
			issuer: str(p.issuer),
			event: str(p.event),
			status: str(p.status),
			messageType: str(p.message_type),
			link: str(p.link),
			web: str(p.web),
			attribution,
			derived: Array.isArray(p.derived) ? (p.derived.filter((d) => typeof d === 'string') as string[]) : [],
			geometrySource,
			geometry
		});
	}

	const coverage: Coverage[] = (Array.isArray(meta.coverage) ? meta.coverage : []).map((c) => {
		const o = obj(c);
		return {
			source: str(o.source) ?? '',
			country: str(o.country) ?? cc,
			status: str(o.status) ?? 'unknown',
			warningsInFeed: num(o.warnings_in_feed),
			warningsNotMatchable: num(o.warnings_not_matchable),
			note: str(o.note)
		};
	});
	if (attributions.size === 0 && str(meta.attribution)) attributions.add(str(meta.attribution)!);

	return {
		data: {
			cc,
			generated: num(meta.server_utc),
			coverage,
			attributions: [...attributions],
			disclaimer: str(meta.disclaimer),
			shapes,
			warnings
		},
		details
	};
}

/**
 * The text to show for a reader of `lang`: the issuer's text in that language when there is one, else in
 * English, else the first one. Never a translation.
 */
export function pickText<T extends { language: string }>(texts: T[], lang: string): T | null {
	if (texts.length === 0) return null;
	const prefix = (t: T, p: string) => t.language.toLowerCase().startsWith(p);
	return texts.find((t) => prefix(t, lang)) ?? texts.find((t) => prefix(t, 'en')) ?? texts[0];
}

/** A URL slug of an area name (letters and digits, accents removed). */
export function slug(name: string): string {
	return name
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

const numList = (v: unknown): number[] | null =>
	Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number' && Number.isFinite(x))
		? (v as number[])
		: null;

/** The weather of `/v1/point`, without the nearby hazards (the page has them) and without the radar fields. */
export function pointFromApi(body: unknown): PointWeather {
	const p = obj(body);
	const coords = obj(p.coordinates);
	const c = p.current == null ? null : obj(p.current);
	const rain = p.rain_nowcast == null ? null : obj(p.rain_nowcast);
	const air = p.air_quality == null ? null : obj(p.air_quality);
	const river = p.flood_risk == null ? null : obj(p.flood_risk);
	const marine = p.marine == null ? null : obj(p.marine);
	const space = p.space_weather == null ? null : obj(p.space_weather);
	const fires = p.fires_nearby == null ? null : obj(p.fires_nearby);
	return {
		lat: num(coords.lat) ?? NaN,
		lon: num(coords.lon) ?? NaN,
		generated: num(p.server_utc),
		utcOffsetS: num(p.utc_offset_s),
		provider: str(p.weather_provider),
		fallback: bool(p.fallback_used) ?? false,
		attribution: str(p.weather_attribution),
		current: c && {
			tempC: num(c.temp_c),
			feelsLikeC: num(c.feels_like_c),
			humidityPct: num(c.humidity_pct),
			pressureHpa: num(c.pressure_hpa),
			windKmh: num(c.wind_kmh),
			gustKmh: num(c.gust_kmh),
			windDeg: num(c.wind_deg),
			rainMm: num(c.rain_1h_mm),
			code: num(c.weather_code),
			uv: num(c.uv_index)
		},
		daily: (Array.isArray(p.daily) ? p.daily : []).flatMap((raw) => {
			const d = obj(raw);
			const date = str(d.date);
			if (!date) return [];
			return [
				{
					date,
					code: num(d.code),
					tminC: num(d.tmin),
					tmaxC: num(d.tmax),
					rainMm: num(d.rain_mm),
					rainProbabilityPct: num(d.rain_probability_pct),
					windMaxKmh: num(d.wind_max),
					uvMax: num(d.uv_max)
				}
			];
		}),
		rain: rain && {
			stepMinutes: num(rain.interval_minutes),
			mmPerStep: numList(rain.mm_per_step),
			expected60: bool(rain.rain_expected_60m),
			maxMmH: num(rain.max_mm_h),
			attribution: str(rain.attribution)
		},
		air: air && {
			eaqi: num(air.european_aqi),
			usAqi: num(air.us_aqi),
			pm25: num(air.pm2_5_ugm3),
			pm10: num(air.pm10_ugm3),
			dust: num(air.dust_ugm3),
			stale: bool(air.stale) ?? false,
			attribution: str(air.attribution)
		},
		river: river && {
			todayM3s: num(river.river_discharge_m3s),
			meanM3s: num(river.river_discharge_mean_m3s),
			maxM3s: num(river.river_discharge_max_m3s),
			stale: bool(river.stale) ?? false,
			attribution: str(river.attribution)
		},
		marine: marine && {
			waveM: num(marine.wave_height_m),
			waveDeg: num(marine.wave_direction_deg),
			wavePeriodS: num(marine.wave_period_s),
			swellM: num(marine.swell_wave_height_m),
			swellDeg: num(marine.swell_wave_direction_deg),
			swellPeriodS: num(marine.swell_wave_period_s),
			currentKmh: num(marine.ocean_current_velocity_kmh),
			currentDeg: num(marine.ocean_current_direction_deg),
			stale: bool(marine.stale) ?? false,
			attribution: str(marine.attribution)
		},
		space: space && {
			kp: num(space.solar_kp),
			storm: str(space.solar_storm_level),
			attribution: str(space.attribution)
		},
		fires: fires && {
			radiusKm: num(fires.radius_km),
			count: num(fires.count_24h),
			nearestKm: num(fires.nearest_km),
			maxFrpMw: num(fires.max_frp_mw),
			latest: num(fires.latest_utc),
			readAt: num(fires.data_read_utc),
			stale: bool(fires.stale) ?? false,
			attribution: str(fires.attribution),
			disclaimer: str(fires.disclaimer)
		}
	};
}

const CONFIDENCE = new Set(['low', 'nominal', 'high']);

/**
 * A tile of active fires from `/v1/fires/grid` (cells) or `/v1/fires` (detections), cut down to what the map
 * shows: short property names, coordinates to 4 decimals (about 10 m, for pixels of 375 m).
 */
export function firesFromApi(body: unknown, kind: 'cells' | 'dots'): FireTile {
	const p = obj(body);
	const meta = obj(p.metadata);
	const features: Feature[] = [];
	for (const raw of Array.isArray(p.features) ? p.features : []) {
		const f = obj(raw);
		const coords = obj(f.geometry).coordinates;
		if (!Array.isArray(coords) || num(coords[0]) == null || num(coords[1]) == null) continue;
		const props = obj(f.properties);
		const out: Record<string, string | number> = {};
		const put = (key: string, value: string | number | null) => {
			if (value != null) out[key] = value;
		};
		if (kind === 'cells') {
			const n = num(props.count);
			if (n == null || n < 1) continue;
			put('n', n);
			put('frp', num(props.max_frp_mw));
			put('t', num(props.latest_utc));
		} else {
			put('t', num(props.acq_utc));
			put('frp', num(props.frp_mw));
			const c = str(props.confidence);
			put('c', c && CONFIDENCE.has(c) ? c : null);
			put('s', str(props.satellite));
			put('d', str(props.daynight));
		}
		features.push({
			type: 'Feature',
			geometry: roundGeometry({ type: 'Point', coordinates: [coords[0], coords[1]] }, 4),
			properties: out
		});
	}
	return {
		features: { type: 'FeatureCollection', features },
		truncated: bool(meta.truncated) ?? false,
		windowHours: num(meta.window_hours),
		stale: bool(meta.stale) ?? false,
		attribution: str(meta.attribution),
		disclaimer: str(meta.disclaimer)
	};
}

/** The forecast of a hazard: its features rounded, a box to frame them, the official messages it cites. */
export function forecastFromApi(hazardId: string, body: unknown): HazardForecast {
	const p = obj(body);
	const features: Feature[] = [];
	const messages = new Set<string>();
	for (const raw of Array.isArray(p.features) ? p.features : []) {
		const feature = obj(raw) as unknown as Feature;
		const props = obj(feature.properties);
		if (!feature.geometry || !str(props.kind)) continue;
		features.push({ type: 'Feature', geometry: roundGeometry(feature.geometry), properties: props });
		for (const alert of Array.isArray(props.alerts) ? props.alerts : []) {
			const message = str(obj(alert).message);
			if (message) messages.add(message);
		}
	}
	const given = Array.isArray(p.bbox) && p.bbox.length === 4 && p.bbox.every((v) => num(v) != null);
	let bbox = given ? (p.bbox as [number, number, number, number]) : null;
	if (!bbox) {
		for (const f of features) {
			const b = geometryBox(f.geometry);
			if (b)
				bbox = bbox
					? [
							Math.min(bbox[0], b[0]),
							Math.min(bbox[1], b[1]),
							Math.max(bbox[2], b[2]),
							Math.max(bbox[3], b[3])
						]
					: b;
		}
	}
	return {
		hazardId,
		title: str(p.title),
		kind: str(p.kind),
		source: str(p.source),
		issued: num(p.issued_utc),
		advisory: str(p.advisory),
		advisoryUrl: str(p.advisory_url),
		attribution: str(p.attribution),
		reason: str(p.reason),
		bbox,
		features: { type: 'FeatureCollection', features },
		messages: [...messages]
	};
}
