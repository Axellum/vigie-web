// The site's own view of the Vigie API data. Every field the API did not give stays null.
import type { FeatureCollection, Geometry } from 'geojson';

export type Level = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN';

export interface Hazard {
	id: string;
	category: string;
	level: Level | null;
	title: string;
	source: string;
	sources: string[];
	time: number | null;
	value: number | null;
	unit: string | null;
	depthKm: number | null;
	tsunami: boolean | null;
	lon: number;
	lat: number;
	attribution: string | null;
	/** The API has a forecast to draw for it (a storm's cone, a tsunami's arrival times). */
	hasForecast: boolean;
	/** What an earthquake or a volcanic event is close to, nearest first: named active faults, volcanoes the sources
	 * report. Calculated by the API, never a level. [] when nothing is near; null when it was not compared. */
	nearPlaces: NearPlace[] | null;
}

export interface NearPlace {
	name: string;
	/** `fault` or `volcano`; another value is shown as the API gave it. */
	kind: string;
	distanceKm: number | null;
}

/**
 * The forecast of a hazard (`/v1/geojson/hazards/{id}/forecast`): features whose `kind` says what they are
 * (cone, track, position, watch_warning for a storm; epicentre, eta for a tsunami), with the values the source
 * gave and nothing else.
 */
export interface HazardForecast {
	hazardId: string;
	title: string | null;
	kind: string | null;
	source: string | null;
	issued: number | null;
	advisory: string | null;
	advisoryUrl: string | null;
	attribution: string | null;
	/** Why there is nothing to draw, in the API's words. */
	reason: string | null;
	bbox: [number, number, number, number] | null;
	features: FeatureCollection;
	/** Identifiers of the official messages the forecast comes from (a tsunami's warnings). */
	messages: string[];
}

export interface HazardsData {
	generated: number | null;
	attribution: string | null;
	items: Hazard[];
}

/** A text of a warning in one language, as the issuer wrote it. */
export interface WarningText {
	language: string;
	senderName: string | null;
	event: string | null;
	headline: string | null;
	description: string | null;
	instruction: string | null;
}

export interface WarningSummary {
	/** The site's id: the message identifier and the area. */
	id: string;
	cc: string;
	source: string;
	level: Level | null;
	levelOriginal: string | null;
	phenomenon: string | null;
	area: string | null;
	sent: number | null;
	onset: number | null;
	expires: number | null;
	ends: number | null;
	/** Key of the shape in `WarningsData.shapes`, or null when the warning cannot be placed on a map. */
	shape: string | null;
	/** Short texts (headline and event) in every language the issuer gave. */
	texts: Pick<WarningText, 'language' | 'headline' | 'event'>[];
}

export interface WarningDetail extends Omit<WarningSummary, 'texts'> {
	/** Identifier of the official message (shared by the areas it covers). */
	identifier: string;
	texts: WarningText[];
	issuer: string | null;
	event: string | null;
	status: string | null;
	messageType: string | null;
	link: string | null;
	web: string | null;
	attribution: string | null;
	derived: string[];
	geometrySource: string | null;
	geometry: Geometry | null;
}

/** A country the API serves official warnings for (`/v1/vigilances/countries`). */
export interface ServedCountry {
	country: string;
	sources: string[];
	/** False when the reuse licence of one of its sources is not confirmed. */
	licenceVerified: boolean;
}

/** A country the API reads no official warning for, and why (`no_source`, `law_restricts`…). */
export interface UncoveredCountry {
	country: string;
	reasonCode: string | null;
	/** The API's own words, in English. */
	reason: string | null;
}

export interface Coverage {
	source: string;
	country: string;
	status: string;
	warningsInFeed: number | null;
	warningsNotMatchable: number | null;
	note: string | null;
}

export interface WarningsData {
	cc: string;
	generated: number | null;
	coverage: Coverage[];
	attributions: string[];
	disclaimer: string | null;
	shapes: Record<string, Geometry>;
	warnings: WarningSummary[];
}

export interface Provider {
	name: string;
	healthy: boolean | null;
	[key: string]: unknown;
}

/** Weather at one point of the API's grid (`/v1/point`). Every value the API did not give stays null. */
export interface PointWeather {
	/** The grid point that was asked: the visitor's position rounded to the weather grid. */
	lat: number;
	lon: number;
	generated: number | null;
	utcOffsetS: number | null;
	provider: string | null;
	fallback: boolean;
	/** Credit for `current` and `daily`; the other blocks carry their own. */
	attribution: string | null;
	current: {
		tempC: number | null;
		feelsLikeC: number | null;
		humidityPct: number | null;
		pressureHpa: number | null;
		windKmh: number | null;
		gustKmh: number | null;
		windDeg: number | null;
		rainMm: number | null;
		code: number | null;
		uv: number | null;
	} | null;
	daily: {
		date: string;
		code: number | null;
		tminC: number | null;
		tmaxC: number | null;
		rainMm: number | null;
		rainProbabilityPct: number | null;
		windMaxKmh: number | null;
		uvMax: number | null;
	}[];
	/** Rain over the next hour, in steps; the radar fields of the API are not used (their terms). */
	rain: {
		stepMinutes: number | null;
		mmPerStep: number[] | null;
		expected60: boolean | null;
		maxMmH: number | null;
		attribution: string | null;
	} | null;
	air: {
		eaqi: number | null;
		usAqi: number | null;
		pm25: number | null;
		pm10: number | null;
		dust: number | null;
		stale: boolean;
		attribution: string | null;
	} | null;
	/** River discharge at the point (GloFAS): the raw values only, not the API's heuristic level. */
	river: {
		todayM3s: number | null;
		meanM3s: number | null;
		maxM3s: number | null;
		stale: boolean;
		attribution: string | null;
	} | null;
	marine: {
		waveM: number | null;
		waveDeg: number | null;
		wavePeriodS: number | null;
		swellM: number | null;
		swellDeg: number | null;
		swellPeriodS: number | null;
		currentKmh: number | null;
		currentDeg: number | null;
		stale: boolean;
		attribution: string | null;
	} | null;
	space: {
		kp: number | null;
		storm: string | null;
		attribution: string | null;
	} | null;
	/** The active fires seen by satellite around the point in 24 hours (NASA FIRMS), as the API sums them up:
	 * derived figures, never an alert. Null when the API has no fire data. */
	fires: {
		radiusKm: number | null;
		count: number | null;
		nearestKm: number | null;
		maxFrpMw: number | null;
		latest: number | null;
		/** When the API last read FIRMS: the detections are from before. */
		readAt: number | null;
		stale: boolean;
		attribution: string | null;
		disclaimer: string | null;
	} | null;
}

/** One tile of the active fires (`/data/fires/<level>/<x>_<y>.json`). */
export interface FireTile {
	/** Points: a cell (`n` detections, `frp` the highest power in MW, `t` the latest time) or a detection (`t` time,
	 * `frp`, `c` confidence, `s` satellite, `d` day or night). A value the API did not give is absent. */
	features: FeatureCollection;
	/** The API kept only the strongest detections of the tile. */
	truncated: boolean;
	windowHours: number | null;
	stale: boolean;
	attribution: string | null;
	disclaimer: string | null;
}
