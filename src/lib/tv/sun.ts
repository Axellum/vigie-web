// Sunrise and sunset of a place, worked out here, for the screens that show a page of the account (`/tv/p/<secret>`): their places can
// be anywhere, and the API gives the sun only for the surf spots. It is the sunrise equation (solar transit and hour angle, the Sun's
// disc at the horizon, no refraction table), good to a minute or two: enough to turn a screen to night, not to write a time of day.
// Pure: the same place and the same `now` give the same windows.

const RAD = Math.PI / 180;
const J2000 = 2451545.0;
const UNIX_EPOCH_JD = 2440587.5;
/** The Sun's centre when its upper edge touches the horizon, with the usual refraction: -0.833 degree. */
const HORIZON = -0.833;

const frac360 = (x: number): number => ((x % 360) + 360) % 360;

/** The moments the Sun rises and sets on the solar day number `n` (days since J2000) at this place, as epoch seconds; null where
 *  it neither rises nor sets that day (polar day or night). */
function sunOfDay(lat: number, lon: number, n: number): [number, number] | null {
	const mean = n - lon / 360; // the mean solar time at this longitude
	const anomaly = frac360(357.5291 + 0.98560028 * mean);
	const m = anomaly * RAD;
	const centre = 1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m);
	const lambda = frac360(anomaly + centre + 180 + 102.9372) * RAD; // ecliptic longitude
	const transit = J2000 + mean + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * lambda);
	const sinDec = Math.sin(lambda) * Math.sin(23.4397 * RAD);
	const dec = Math.asin(sinDec);
	const cosHour =
		(Math.sin(HORIZON * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * Math.cos(dec));
	if (!Number.isFinite(cosHour) || cosHour < -1 || cosHour > 1) return null;
	const hour = Math.acos(cosHour) / RAD / 360; // half the day, in days
	const epoch = (jd: number) => Math.round((jd - UNIX_EPOCH_JD) * 86400);
	return [epoch(transit - hour), epoch(transit + hour)];
}

/**
 * The daylight windows `[sunrise, sunset]` (epoch seconds) around `now` at a place: the ones that are not over for more than a day,
 * in the order of time, as the screen's script wants them. Empty at the poles in the polar night or day (the screen then stays as
 * it was drawn).
 */
export function sunWindows(lat: number, lon: number, now: number): [number, number][] {
	if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) return [];
	const today = Math.floor(now / 86400 + UNIX_EPOCH_JD - J2000 + 0.5);
	const windows: [number, number][] = [];
	for (let n = today - 1; n <= today + 2; n++) {
		const w = sunOfDay(lat, lon, n);
		if (w && w[1] > now - 86_400) windows.push(w);
	}
	return windows.sort((a, b) => a[0] - b[0]);
}
