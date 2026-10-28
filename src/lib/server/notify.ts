// Matches the alerts in force with the zones of the accounts, keeps what matched (the account's history) and
// sends a push notification for what is new. It runs on the data the site already caches: the requests to the
// API depend on the countries of the zones, not on the number of accounts or visitors.
//
// - A zone is compared once without notifying (`baseline_done`): what is in force when it is made is not news.
// - An alert is told once per zone and level; it is told again only when its level rises.
// - Quiet hours (22:00 to 07:00 in the person's time zone): only red alerts are sent; the others are kept.
import type { Geometry } from 'geojson';
import { boxesOverlap, coveredInView, geometryBox, type Box } from '#lib/geo.js';
import { t, type Key, type Lang } from '#lib/i18n.js';
import { asLevel, rank } from '#lib/levels.js';
import { countryAt, type Borders } from '#lib/near.js';
import { hazardHref, warningHref, warningTitle } from '#lib/rows.js';
import { slug } from '#lib/transform.js';
import type { Level, WarningSummary } from '#lib/types.js';
import type { Query, Sql } from './db';
import { sendToUser } from './push';
import { getHazards, getWarnings, servedCodes } from './vigie';

type Notifiable = Exclude<Level, 'GREEN'>;

export interface Alert {
	key: string;
	/** 'VIGILANCE' for an official warning, else the hazard's category. */
	kind: string;
	level: Notifiable;
	cc: string | null;
	areaSlug: string | null;
	url: string;
	geometry: Geometry | null;
	box: Box | null;
	/** The title in a language: an official warning keeps the issuer's words. */
	title: (lang: Lang) => string;
}

export interface ZoneRow {
	id: string;
	user_id: string;
	name: string;
	kind: 'circle' | 'polygon' | 'country' | 'area';
	country: string | null;
	area: string | null;
	min_level: Notifiable;
	kinds: string[];
	baseline_done: boolean;
	box: [number, number, number, number] | null;
	lang: Lang;
	quiet_hours: boolean;
	time_zone: string | null;
}

let borders: Borders | null = null;
async function loadBorders(): Promise<Borders> {
	borders ??= (await import('#lib/data/borders.json')).default as unknown as Borders;
	return borders;
}

const notifiable = (level: unknown): Notifiable | null => {
	const l = asLevel(level);
	return l && l !== 'GREEN' ? l : null;
};

/** The alerts in force, as the site's cache has them; `complete` is false when a source could not be read. */
export async function collectAlerts(countries: string[]): Promise<{ alerts: Alert[]; complete: boolean }> {
	const alerts: Alert[] = [];
	let complete = true;
	const world = await loadBorders();
	try {
		for (const h of (await getHazards()).value.items) {
			const level = notifiable(h.level);
			if (!level) continue;
			alerts.push({
				key: `h:${h.id}`,
				kind: h.category,
				level,
				cc: countryAt(world, { lat: h.lat, lon: h.lon }),
				areaSlug: null,
				url: hazardHref(h),
				geometry: { type: 'Point', coordinates: [h.lon, h.lat] },
				box: [h.lon, h.lat, h.lon, h.lat],
				title: () => h.title
			});
		}
	} catch {
		complete = false;
	}
	for (const cc of countries) {
		try {
			const result = await getWarnings(cc);
			if (!result) continue;
			const { shapes, warnings } = result.value.data;
			for (const w of warnings as WarningSummary[]) {
				const level = notifiable(w.level);
				if (!level) continue;
				const geometry = w.shape ? (shapes[w.shape] ?? null) : null;
				alerts.push({
					key: `w:${w.cc}:${w.id}`,
					kind: 'VIGILANCE',
					level,
					cc: w.cc,
					areaSlug: w.area ? slug(w.area) : null,
					url: warningHref(w),
					geometry,
					box: geometry ? geometryBox(geometry) : null,
					title: (lang) => warningTitle(w, lang)
				});
			}
		} catch {
			complete = false;
		}
	}
	return { alerts, complete };
}

/** The pairs (zone, alert) that match by country or area, before any geometry. */
function matchByCode(zone: ZoneRow, alert: Alert): boolean {
	if (zone.kind === 'country') return alert.cc === zone.country;
	if (zone.kind === 'area')
		return (
			alert.kind === 'VIGILANCE' && alert.cc === zone.country && alert.areaSlug === slug(zone.area ?? '')
		);
	return false;
}

/** Every (zone, alert) that matches: kinds, lowest level, then the code or the surface (PostGIS). */
export async function matchZones(sql: Query, zones: ZoneRow[], alerts: Alert[]): Promise<[ZoneRow, Alert][]> {
	const wanted = (z: ZoneRow, a: Alert) => z.kinds.includes(a.kind) && rank(a.level) >= rank(z.min_level);
	const pairs: [ZoneRow, Alert][] = [];
	const candidates: { z: number; zid: string; a: number }[] = [];
	zones.forEach((z, zi) =>
		alerts.forEach((a, ai) => {
			if (!wanted(z, a)) return;
			if (z.kind === 'country' || z.kind === 'area') {
				if (matchByCode(z, a)) pairs.push([z, a]);
			} else if (z.box && a.box && a.geometry && boxesOverlap(z.box, a.box))
				candidates.push({ z: zi, zid: z.id, a: ai });
		})
	);
	if (candidates.length) {
		const used = [...new Set(candidates.map((c) => c.a))];
		const geoms = used.map((ai) => ({ i: ai, g: JSON.stringify(alerts[ai].geometry) }));
		// Every geometry once, then the pairs: a warning's shape may be large.
		const rows = await sql<{ z: number; a: number }[]>`
			with g as (
				select i, st_setsrid(st_geomfromgeojson(g), 4326)::geography as geog
				from jsonb_to_recordset(${sql.json(geoms)}) as x(i int, g text)
			), c as (select * from jsonb_to_recordset(${sql.json(candidates)}) as x(z int, zid uuid, a int))
			select c.z, c.a from c
			join g on g.i = c.a
			join zones on zones.id = c.zid
			where st_intersects(zones.geom, g.geog)`;
		for (const r of rows) pairs.push([zones[r.z], alerts[r.a]]);
	}
	return pairs;
}

/** Whether it is between 22:00 and 07:00 for the person (Paris when the time zone is unknown or wrong). */
export function inQuietHours(timeZone: string | null, now = new Date()): boolean {
	let hour: number;
	try {
		hour = Number(
			new Intl.DateTimeFormat('en-GB', {
				hour: '2-digit',
				hourCycle: 'h23',
				timeZone: timeZone || 'Europe/Paris'
			}).format(now)
		);
	} catch {
		return inQuietHours('Europe/Paris', now);
	}
	return hour >= 22 || hour < 7;
}

type Outcome = 'sent' | 'quiet' | 'baseline' | 'none' | 'failed';

/** One run: match, keep, notify. Returns what it did, for the log and the tests. */
export async function matchAndNotify(
	sql: Sql
): Promise<{ zones: number; alerts: number; matched: number; sent: number }> {
	return sql.begin(async (tx) => {
		// One run at a time, whatever the number of processes of the site.
		const [{ locked }] = await tx<
			{ locked: boolean }[]
		>`select pg_try_advisory_xact_lock(20261026) as locked`;
		if (!locked) return { zones: 0, alerts: 0, matched: 0, sent: 0 };
		const zones = await tx<ZoneRow[]>`
			select z.id, z.user_id, z.name, z.kind, z.country, z.area, z.min_level, z.kinds, z.baseline_done,
				case when z.geom is null then null else array[
					st_xmin(z.geom::geometry), st_ymin(z.geom::geometry), st_xmax(z.geom::geometry), st_ymax(z.geom::geometry)
				] end as box,
				u.lang, u.quiet_hours, u.time_zone
			from zones z join users u on u.id = z.user_id`;
		if (!zones.length) return { zones: 0, alerts: 0, matched: 0, sent: 0 };
		const served = await servedCodes();
		const countries = new Set<string>();
		for (const z of zones) {
			if (z.country && served.includes(z.country)) countries.add(z.country);
			if (z.box) for (const cc of coveredInView(z.box, served)) countries.add(cc);
		}
		const { alerts, complete } = await collectAlerts([...countries]);
		const pairs = await matchZones(tx, zones, alerts);

		// What each zone was already told, per alert: its highest level.
		const told = new Map<string, number>();
		const previous = await tx<{ zone_id: string; alert_key: string; level: Level }[]>`
			select zone_id, alert_key, level from zone_alerts where zone_id in ${tx(zones.map((z) => z.id))}`;
		for (const p of previous) {
			const k = `${p.zone_id}|${p.alert_key}`;
			told.set(k, Math.max(told.get(k) ?? -1, rank(p.level)));
		}
		const fresh = pairs.filter(([z, a]) => (told.get(`${z.id}|${a.key}`) ?? -1) < rank(a.level));

		// One notification per person and alert, naming every zone it falls in.
		const byPerson = new Map<string, { zone: ZoneRow; alert: Alert }[]>();
		for (const [zone, alert] of fresh) {
			const k = `${zone.user_id}|${alert.key}|${alert.level}`;
			byPerson.set(k, [...(byPerson.get(k) ?? []), { zone, alert }]);
		}
		let sent = 0;
		const now = new Date();
		for (const group of byPerson.values()) {
			const { alert } = group[0];
			const person = group[0].zone;
			const news = group.filter((g) => g.zone.baseline_done);
			let outcome: Outcome = 'baseline';
			if (news.length) {
				if (person.quiet_hours && alert.level !== 'RED' && inQuietHours(person.time_zone, now))
					outcome = 'quiet';
				else {
					const lang = person.lang;
					const result = await sendToUser(tx, person.user_id, {
						title: `${t(lang, `level.${alert.level}` as Key)} · ${alert.title(lang)}`,
						body: t(lang, 'notify.body', { zones: news.map((g) => g.zone.name).join(', ') }),
						url: alert.url,
						tag: alert.key,
						level: alert.level
					});
					outcome = !result || result.sent + result.failed === 0 ? 'none' : result.sent ? 'sent' : 'failed';
					if (result?.sent) sent++;
				}
			}
			for (const { zone } of group) {
				await tx`
					insert into zone_alerts (user_id, zone_id, alert_key, kind, level, title, url, outcome)
					values (${zone.user_id}, ${zone.id}, ${alert.key}, ${alert.kind}, ${alert.level},
						${alert.title(zone.lang)}, ${alert.url}, ${zone.baseline_done ? outcome : 'baseline'})
					on conflict do nothing`;
			}
		}
		// A zone's first comparison is its baseline, if every source could be read. The history is what the
		// zones were told: an alert is forgotten 30 days after it matched, unless it is still in force (it would
		// be told again).
		if (complete) {
			const firsts = zones.filter((z) => !z.baseline_done).map((z) => z.id);
			if (firsts.length) await tx`update zones set baseline_done = true where id in ${tx(firsts)}`;
			const current = [...new Set(pairs.map(([z, a]) => `${z.id}|${a.key}`))];
			await tx`
				delete from zone_alerts where matched_at < now() - interval '30 days'
				and not (zone_id::text || '|' || alert_key = any(${current}::text[]))`;
		}
		return { zones: zones.length, alerts: alerts.length, matched: fresh.length, sent };
	});
}

/** The account's history: what its zones matched in the last 30 days, the latest first. */
export async function listZoneAlerts(sql: Sql, userId: string) {
	return sql<
		{
			matched_at: Date;
			level: Notifiable;
			title: string;
			url: string;
			outcome: Outcome;
			zone: string;
			kind: string;
		}[]
	>`
		select a.matched_at, a.level, a.title, a.url, a.outcome, a.kind, z.name as zone
		from zone_alerts a join zones z on z.id = a.zone_id
		where a.user_id = ${userId} and a.matched_at > now() - interval '30 days'
		order by a.matched_at desc limit 200`;
}
