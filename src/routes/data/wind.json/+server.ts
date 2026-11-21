import { error, json } from '@sveltejs/kit';
import { cacheHeaders, getSeaBuoys, getStationWind, TTL_S } from '#lib/server/vigie.js';
import { inBox, parseWindBox, windFromBuoys, type WindMap, type WindPoint } from '#lib/wind.js';
import type { RequestHandler } from './$types';

// The wind measured now in a box, for the map: the Météo-France stations and the offshore buoys,
// /data/wind.json?bbox=-6,41,10,52. Each source alone may fail: the other is still served; both failing is a 502.
export const GET: RequestHandler = async ({ url }) => {
	const box = parseWindBox(url.searchParams.get('bbox'));
	if (!box) error(400, 'bbox must be west,south,east,north');
	const [stations, buoys] = await Promise.allSettled([getStationWind(), getSeaBuoys()]);
	if (stations.status === 'rejected' && buoys.status === 'rejected') error(502, 'The wind could not be read');
	const points: WindPoint[] = [];
	const credits: string[] = [];
	let stale = false;
	if (stations.status === 'fulfilled' && stations.value.value) {
		const v = stations.value.value;
		points.push(...v.points.filter((p) => inBox(box, p.lat, p.lon)));
		if (v.attribution) credits.push(v.attribution);
		stale ||= v.stale || stations.value.stale;
	}
	if (buoys.status === 'fulfilled' && buoys.value.value) {
		const v = buoys.value.value;
		const kept = windFromBuoys(v.buoys).filter((p) => inBox(box, p.lat, p.lon));
		points.push(...kept);
		if (kept.length && v.attribution) credits.push(v.attribution);
		stale ||= v.stale;
	}
	const body: WindMap = {
		points,
		measured: points.reduce<number | null>((m, p) => (m === null || p.measured > m ? p.measured : m), null),
		stale,
		attribution: credits.length ? credits.join(' · ') : null
	};
	return json(body, { headers: cacheHeaders(TTL_S.stationWind) });
};
