// Where a point stands: the official warnings whose area holds it, the river sections and hazards around it.
// Computed in the browser from the data every visitor already loads, so that the position stays there.
// Pure functions: no network, no clock.
import type { Geometry, Position } from 'geojson';
import { BOXES } from './geo';
import type { Hazard, WarningsData, WarningSummary } from './types';

const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;

/** The API's weather grid (`VIGIE_GRID_FORECAST_DEG`): only this rounded position is sent for the weather. */
export const WEATHER_GRID_DEG = 0.05;
/** How far from a point a river section still counts, as in the API (`DEFAULT_RIVER_RADIUS_KM`). */
export const RIVER_RADIUS_KM = 5;
/**
 * A point that no area holds (a coast simplified away) belongs to the areas this close, like the API's
 * `GEOCODE_MARGIN_DEG` (0.02°, about 2 km).
 */
export const AREA_MARGIN_KM = 2;
/** A covered country's box this close to the point (degrees) is searched too: the boxes are coarse. */
const BOX_MARGIN_DEG = 0.5;

export interface Place {
	lat: number;
	lon: number;
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: Place, b: Place): number {
	const dLat = (b.lat - a.lat) * RAD;
	const dLon = (b.lon - a.lon) * RAD;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The nearest point of the weather grid, as the API computes it (at most 4 decimals). */
export function snapToGrid(place: Place, step = WEATHER_GRID_DEG): Place {
	const snap = (v: number) => Math.round(Math.round(v / step) * step * 1e4) / 1e4 + 0;
	let lon = snap(place.lon);
	if (lon > 180) lon -= 360;
	else if (lon < -180) lon += 360;
	return { lat: Math.min(90, Math.max(-90, snap(place.lat))), lon };
}

/** A position read from the address (`#48.853,2.349` or `#48.853,2.349,300` with a radius), or null. */
export function parsePlace(hash: string): (Place & { radiusKm: number | null }) | null {
	const m = /^#?(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:,(\d{1,4}))?$/.exec(hash.trim());
	if (!m) return null;
	const lat = Number(m[1]),
		lon = Number(m[2]);
	if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return null;
	return { lat, lon, radiusKm: m[3] ? Number(m[3]) : null };
}

/** The address of a position: 3 decimals (about 100 m) and the radius. */
export function placeHash(place: Place, radiusKm: number): string {
	const f = (v: number) => String(Math.round(v * 1000) / 1000 + 0);
	return `#${f(place.lat)},${f(place.lon)},${radiusKm}`;
}

/** The covered countries whose boxes are near the point: their warnings are the only ones that can hold it. */
export function countriesNear(place: Place, covered: readonly string[]): string[] {
	return boxesNear(place, covered);
}

/** The countries of `codes` with a box near the point. */
function boxesNear(place: Place, codes: readonly string[]): string[] {
	return codes.filter((cc) =>
		(BOXES[cc] ?? []).some(
			([w, s, e, n]) =>
				place.lat >= s - BOX_MARGIN_DEG &&
				place.lat <= n + BOX_MARGIN_DEG &&
				place.lon >= w - BOX_MARGIN_DEG &&
				place.lon <= e + BOX_MARGIN_DEG
		)
	);
}

/** Ray casting on one ring (first and last positions may or may not repeat). */
function ringHolds(ring: Position[], lon: number, lat: number): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i];
		const [xj, yj] = ring[j];
		if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

function polygonHolds(rings: Position[][], lon: number, lat: number): boolean {
	if (rings.length === 0 || !ringHolds(rings[0], lon, lat)) return false;
	return !rings.slice(1).some((hole) => ringHolds(hole, lon, lat));
}

/** Whether an area (Polygon, MultiPolygon, or a collection of them) holds the point. */
export function geometryHolds(geometry: Geometry, place: Place): boolean {
	switch (geometry.type) {
		case 'Polygon':
			return polygonHolds(geometry.coordinates, place.lon, place.lat);
		case 'MultiPolygon':
			return geometry.coordinates.some((rings) => polygonHolds(rings, place.lon, place.lat));
		case 'GeometryCollection':
			return geometry.geometries.some((g) => geometryHolds(g, place));
		default:
			return false;
	}
}

/** Distance from the point to a segment, in km, on a flat projection around the point (fine for a few km). */
function segmentKm(place: Place, a: Position, b: Position): number {
	const kx = Math.cos(place.lat * RAD) * RAD * EARTH_RADIUS_KM;
	const ky = RAD * EARTH_RADIUS_KM;
	const ax = (a[0] - place.lon) * kx,
		ay = (a[1] - place.lat) * ky;
	const bx = (b[0] - place.lon) * kx,
		by = (b[1] - place.lat) * ky;
	const dx = bx - ax,
		dy = by - ay;
	const len = dx * dx + dy * dy;
	const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
	return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Shortest distance from the point to the edge of an area (Polygon, MultiPolygon), in km; null for other shapes. */
export function edgeDistanceKm(geometry: Geometry, place: Place): number | null {
	const polygons =
		geometry.type === 'Polygon'
			? [geometry.coordinates]
			: geometry.type === 'MultiPolygon'
				? geometry.coordinates
				: geometry.type === 'GeometryCollection'
					? null
					: null;
	if (!polygons) {
		if (geometry.type !== 'GeometryCollection') return null;
		const all = geometry.geometries.map((g) => edgeDistanceKm(g, place)).filter((d) => d != null);
		return all.length ? Math.min(...all) : null;
	}
	let best = Infinity;
	for (const rings of polygons)
		for (const ring of rings)
			for (let i = 1; i < ring.length; i++) best = Math.min(best, segmentKm(place, ring[i - 1], ring[i]));
	return Number.isFinite(best) ? best : null;
}

/** Shortest distance from the point to a line (LineString or MultiLineString), in km; null for other shapes. */
export function lineDistanceKm(geometry: Geometry, place: Place): number | null {
	const lines =
		geometry.type === 'LineString'
			? [geometry.coordinates]
			: geometry.type === 'MultiLineString'
				? geometry.coordinates
				: null;
	if (!lines) return null;
	let best = Infinity;
	for (const line of lines) {
		for (let i = 1; i < line.length; i++) best = Math.min(best, segmentKm(place, line[i - 1], line[i]));
		if (line.length === 1) best = Math.min(best, distanceKm(place, { lon: line[0][0], lat: line[0][1] }));
	}
	return Number.isFinite(best) ? best : null;
}

export interface WarningHere {
	warning: WarningSummary;
	/** A river section near the point, rather than an area. */
	river: boolean;
	/** Distance to a river section, or to an area that does not hold the point (km); null inside an area. */
	distanceKm: number | null;
}

/**
 * The warnings of one country that apply at the point: an area that holds it, or a river section within
 * `riverKm`. When no area of the country holds the point (a coast simplified away), the areas within
 * `AREA_MARGIN_KM` count, with their distance. Warnings without a shape cannot be matched to a point and are
 * returned apart.
 */
export function warningsAt(
	data: WarningsData,
	place: Place,
	riverKm = RIVER_RADIUS_KM
): { here: WarningHere[]; unplaced: WarningSummary[] } {
	const rivers: WarningHere[] = [];
	const inside: WarningHere[] = [];
	const areas: { warning: WarningSummary; geometry: Geometry }[] = [];
	const unplaced: WarningSummary[] = [];
	const lineKm = new Map<string, number | null>();
	const holds = new Map<string, boolean>();
	for (const warning of data.warnings) {
		const geometry = warning.shape ? data.shapes[warning.shape] : undefined;
		if (!warning.shape || !geometry) {
			unplaced.push(warning);
			continue;
		}
		if (!lineKm.has(warning.shape)) lineKm.set(warning.shape, lineDistanceKm(geometry, place));
		const km = lineKm.get(warning.shape) ?? null;
		if (km != null) {
			if (km <= riverKm) rivers.push({ warning, river: true, distanceKm: km });
			continue;
		}
		areas.push({ warning, geometry });
		if (!holds.has(warning.shape)) holds.set(warning.shape, geometryHolds(geometry, place));
		if (holds.get(warning.shape)) inside.push({ warning, river: false, distanceKm: null });
	}
	if (inside.length === 0) {
		const edgeKm = new Map<string, number | null>();
		for (const { warning, geometry } of areas) {
			if (!edgeKm.has(warning.shape!)) edgeKm.set(warning.shape!, edgeDistanceKm(geometry, place));
			const km = edgeKm.get(warning.shape!) ?? null;
			if (km != null && km <= AREA_MARGIN_KM) inside.push({ warning, river: false, distanceKm: km });
		}
	}
	return { here: [...inside, ...rivers], unplaced };
}

/** A circle of `radiusKm` around the point, as a closed ring (for the map). */
export function circleRing(place: Place, radiusKm: number, steps = 72): Position[] {
	const d = radiusKm / EARTH_RADIUS_KM;
	const lat1 = place.lat * RAD,
		lon1 = place.lon * RAD;
	const ring: Position[] = [];
	for (let i = 0; i <= steps; i++) {
		const bearing = ((i % steps) / steps) * 2 * Math.PI;
		const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing));
		const lon2 =
			lon1 +
			Math.atan2(
				Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
				Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
			);
		ring.push([lon2 / RAD, lat2 / RAD]);
	}
	return ring;
}

/** The box that holds the circle of `radiusKm` around the point. */
export function circleBox(place: Place, radiusKm: number): [number, number, number, number] {
	const dLat = radiusKm / (RAD * EARTH_RADIUS_KM);
	const dLon = dLat / Math.max(0.05, Math.cos(place.lat * RAD));
	return [
		place.lon - dLon,
		Math.max(-85, place.lat - dLat),
		place.lon + dLon,
		Math.min(85, place.lat + dLat)
	];
}

/** The simplified borders of the countries the API knows (`src/lib/data/borders.json`): country → polygons. */
export type Borders = Record<string, Position[][][]>;

/** A place this close to a country (a simplified border or coast) belongs to it, like the API's margins. */
export const COUNTRY_MARGIN_KM = 25;

/**
 * The country a place is in, covered or not: the one whose borders hold it, or else the nearest one within
 * `COUNTRY_MARGIN_KM` (a coast, a simplified border); null outside every country of the borders.
 */
export function countryAt(borders: Borders, place: Place): string | null {
	const candidates = boxesNear(place, Object.keys(borders));
	const shape = (cc: string): Geometry => ({ type: 'MultiPolygon', coordinates: borders[cc] });
	const inside = candidates.find((cc) => geometryHolds(shape(cc), place));
	if (inside) return inside;
	let best: string | null = null,
		bestKm = COUNTRY_MARGIN_KM;
	for (const cc of candidates) {
		const km = edgeDistanceKm(shape(cc), place);
		if (km != null && km <= bestKm) {
			best = cc;
			bestKm = km;
		}
	}
	return best;
}

/** Hazards within `radiusKm` of the point, nearest first. */
export function hazardsNear(
	hazards: Hazard[],
	place: Place,
	radiusKm: number
): { hazard: Hazard; distanceKm: number }[] {
	return hazards
		.map((hazard) => ({ hazard, distanceKm: distanceKm(place, hazard) }))
		.filter((h) => h.distanceKm <= radiusKm)
		.sort((a, b) => a.distanceKm - b.distanceKm);
}
