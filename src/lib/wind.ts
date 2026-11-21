// The wind measured now on the map: every Météo-France ground station with an anemometer (vigie-api `GET /v1/stations/wind`,
// a 6-minute observation) and the offshore buoys (`GET /v1/sea/buoys`). Measured, never a forecast and never a warning.
// The map shows a round badge per station (a square per buoy) with the mean wind, a beak toward where the wind goes, and the
// gust in small when it is well above the mean. Where badges would touch, the strongest is kept (`declutter`): every station
// counts, summits too (the choice of the sketch "C1").
import type { Box } from './geo';
import type { SeaBuoy } from './sea/buoys';
import type { WindUnit } from './sea/choice';

export interface WindPoint {
	id: string;
	/** The station's or buoy's name; null for a station the API does not name. */
	name: string | null;
	lat: number;
	lon: number;
	/** The altitude of a station (a summit measures the wind of the crest); null for a buoy. */
	altM: number | null;
	kmh: number;
	gustKmh: number | null;
	/** Degrees the wind blows from; null when calm or not measured (the badge has no beak then). */
	fromDeg: number | null;
	/** Epoch seconds of the observation. */
	measured: number;
	buoy: boolean;
}

export interface WindMap {
	points: WindPoint[];
	/** The newest observation, epoch seconds; null when there is none. */
	measured: number | null;
	stale: boolean;
	attribution: string | null;
}

const obj = (v: unknown): Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** A station of the API's answer; null when it lacks what places it (an id, a position, a wind, a date). */
export function windStationFromApi(raw: unknown): WindPoint | null {
	const s = obj(raw);
	const id = str(s.id);
	const lat = num(s.lat);
	const lon = num(s.lon);
	const kmh = num(s.wind_speed_kmh);
	const measured = num(s.measured_utc);
	if (!id || lat === null || lon === null || kmh === null || kmh < 0 || measured === null) return null;
	const dir = num(s.wind_from_deg);
	return {
		id,
		name: stationName(str(s.name)),
		lat,
		lon,
		altM: num(s.alt_m),
		kmh,
		gustKmh: num(s.wind_gust_kmh),
		fromDeg: dir === null ? null : ((dir % 360) + 360) % 360,
		measured,
		buoy: false
	};
}

/** The stations of `GET /v1/stations/wind`; null for an answer that is not a list (an API without the route, an error). */
export function windStationsFromApi(
	body: unknown
): { points: WindPoint[]; stale: boolean; attribution: string | null } | null {
	const raw = obj(body);
	if (raw.status !== 'ok' && raw.status !== 'not_configured' && raw.status !== 'unavailable') return null;
	const points = (Array.isArray(raw.stations) ? raw.stations : [])
		.map(windStationFromApi)
		.filter((p): p is WindPoint => p !== null);
	return { points, stale: raw.stale === true, attribution: str(raw.attribution) };
}

/** The buoys that measured a wind, as points of the map. */
export function windFromBuoys(buoys: SeaBuoy[]): WindPoint[] {
	return buoys
		.filter((b) => b.windKmh !== null && b.windKmh >= 0)
		.map((b) => ({
			id: `buoy-${b.id}`,
			name: b.name,
			lat: b.lat,
			lon: b.lon,
			altM: null,
			kmh: b.windKmh as number,
			gustKmh: b.gustKmh,
			fromDeg: b.windFromDeg,
			measured: b.measured,
			buoy: true
		}));
}

/** "OUESSANT-STIFF" → "Ouessant-Stiff", "ST GIRONS" → "St Girons": the station names of Météo-France are in capitals. */
export function stationName(raw: string | null): string | null {
	if (!raw) return null;
	return raw
		.toLocaleLowerCase('fr-FR')
		.replace(
			/(^|[\s\-'’(])(\p{L})/gu,
			(_, sep: string, letter: string) => sep + letter.toLocaleUpperCase('fr-FR')
		);
}

/** Inside a box (`[west, south, east, north]`, a west greater than the east crosses the antimeridian). */
export function inBox(box: Box, lat: number, lon: number): boolean {
	const [w, s, e, n] = box;
	if (lat < s || lat > n) return false;
	return w <= e ? lon >= w && lon <= e : lon >= w || lon <= e;
}

/**
 * The box of `/data/wind.json?bbox=w,s,e,n`: whole degrees only (what `windQueryBox` asks), so that the site's answers are few
 * and shared; null for anything else.
 */
export function parseWindBox(raw: string | null): Box | null {
	const parts = (raw ?? '').split(',');
	if (parts.length !== 4 || !parts.every((v) => /^-?\d{1,3}$/.test(v))) return null;
	const [w, s, e, n] = parts.map(Number);
	if (Math.abs(w) > 180 || Math.abs(e) > 180 || s < -90 || n > 90 || s >= n) return null;
	return [w, s, e, n];
}

/** The box asked to the site for a view: rounded out to whole degrees with a margin, so that a small move asks nothing new. */
export function windQueryBox(view: Box): Box {
	const [w, s, e, n] = view;
	const pad = Math.max(1, (n - s) * 0.25);
	const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
	return [
		clamp(Math.floor(w - pad), -180, 180),
		clamp(Math.floor(s - pad), -90, 90),
		clamp(Math.ceil(e + pad), -180, 180),
		clamp(Math.ceil(n + pad), -90, 90)
	];
}

/** The five steps of the colour of a badge, in km/h: below 20, 20 to 30, 30 to 40, 40 to 60, 60 and more. */
export const WIND_STEPS = [20, 30, 40, 60] as const;

/** The step (1 to 5) of a mean wind, for its colour (`--wind-1` … `--wind-5`). */
export function windStep(kmh: number): 1 | 2 | 3 | 4 | 5 {
	const i = WIND_STEPS.findIndex((limit) => kmh < limit);
	return (i === -1 ? 5 : i + 1) as 1 | 2 | 3 | 4 | 5;
}

/** A speed in the visitor's unit, rounded to a whole number (the badges have room for three digits). */
export function windValue(kmh: number, unit: WindUnit): number {
	return Math.round(unit === 'kn' ? kmh / 1.852 : kmh);
}

/** The gust is written on the badge when it is at least this much above the mean (km/h). */
export const GUST_SHOWN_ABOVE_KMH = 15;

export function gustShown(p: WindPoint): boolean {
	return p.gustKmh !== null && p.gustKmh >= p.kmh + GUST_SHOWN_ABOVE_KMH;
}

/** The radius of a badge on screen, in pixels: small over a whole country, larger close in. */
export function badgeRadius(zoom: number): number {
	return zoom < 6 ? 10 : zoom < 8 ? 12 : 14;
}

/**
 * The points kept on screen: the strongest first, and a point whose badge would touch one already kept is left out. `at` gives
 * a point's position on screen in pixels (null: off screen). Every point counts, summits too.
 */
export function declutter<T extends { kmh: number; id: string }>(
	points: T[],
	at: (p: T) => [number, number] | null,
	radius: number
): { point: T; x: number; y: number }[] {
	const gap = 2 * radius + 2;
	const cell = gap;
	const grid = new Map<string, { x: number; y: number }[]>();
	const kept: { point: T; x: number; y: number }[] = [];
	const sorted = [...points].sort((a, b) => b.kmh - a.kmh || (a.id < b.id ? -1 : 1));
	for (const point of sorted) {
		const xy = at(point);
		if (!xy) continue;
		const [x, y] = xy;
		const cx = Math.floor(x / cell);
		const cy = Math.floor(y / cell);
		let touches = false;
		for (let i = cx - 1; i <= cx + 1 && !touches; i++)
			for (let j = cy - 1; j <= cy + 1 && !touches; j++)
				for (const q of grid.get(`${i}:${j}`) ?? [])
					if ((q.x - x) ** 2 + (q.y - y) ** 2 < gap * gap) {
						touches = true;
						break;
					}
		if (touches) continue;
		const key = `${cx}:${cy}`;
		grid.set(key, [...(grid.get(key) ?? []), { x, y }]);
		kept.push({ point, x, y });
	}
	return kept;
}

/** The time of an observation ("23:12"), in the visitor's time zone. */
export function windTime(lang: 'fr' | 'en', epoch: number, timeZone?: string): string {
	return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone
	}).format(new Date(epoch * 1000));
}

/** What the map draws: the points read for the view and the visitor's unit. */
export interface WindOnMap {
	points: WindPoint[];
	unit: WindUnit;
}

/**
 * The SVG of a badge, `2 * radius` wide plus room for the beak all round: a disc (a rounded square for a buoy) of the colour of
 * the mean wind, the mean in the visitor's unit, and a beak that points where the wind goes (none when calm). The colours are
 * the site's tokens (`--wind-1` … `--wind-5`), so a change of theme needs no new drawing.
 */
export function windBadgeSvg(p: WindPoint, unit: WindUnit, radius: number): string {
	const r = radius;
	const size = Math.ceil(2 * r * 1.9);
	const c = size / 2;
	const step = windStep(p.kmh);
	const fill = `var(--wind-${step})`;
	const ink = step === 1 ? 'var(--on-wind-1)' : '#fff';
	const value = windValue(p.kmh, unit);
	const beak =
		p.fromDeg === null
			? ''
			: `<path transform="rotate(${(p.fromDeg + 180) % 360} ${c} ${c})" d="M${c - r * 0.62} ${c - r * 0.6}L${c} ${c - r * 1.78}L${c + r * 0.62} ${c - r * 0.6}Z" fill="${fill}"/>`;
	const shape = p.buoy
		? `<rect x="${c - r}" y="${c - r}" width="${2 * r}" height="${2 * r}" rx="${r * 0.3}" fill="${fill}" stroke="var(--surface)" stroke-width="1.3"/>`
		: `<circle cx="${c}" cy="${c}" r="${r}" fill="${fill}" stroke="var(--surface)" stroke-width="1.3"/>`;
	const font = value >= 100 ? r * 0.82 : r * 0.98;
	return (
		`<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${beak}${shape}` +
		`<text x="${c}" y="${c + font * 0.36}" text-anchor="middle" font-size="${font.toFixed(1)}" font-weight="700" fill="${ink}">${value}</text></svg>`
	);
}
