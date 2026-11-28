// The travel family of the home map: the countries coloured by the advice of one ministry (one at a time, as on the travel
// page), how many countries each colour has, and the card of a country clicked on the map, which sets the ministries side by
// side. Read once when the family is first chosen (`/data/travel.json`, the same for everybody); the borders (100 kB) after.
import type { FeatureCollection } from 'geojson';
import type { Borders } from '../near';
import type { Ministry, TravelRow } from '../travel';
import type { Level } from '../types';

export const TRAVEL_LEVELS: Level[] = ['GREEN', 'YELLOW', 'ORANGE', 'RED'];

export class TravelFamily {
	status = $state<'idle' | 'loading' | 'ok' | 'failed'>('idle');
	ministries = $state<Ministry[]>([]);
	rows = $state<TravelRow[]>([]);
	attribution = $state<string | null>(null);
	borders = $state<Borders | null>(null);
	/** The ministry whose map is shown (the first one read until another is chosen). */
	chosen = $state<string | null>(null);
	/** The country whose card is open over the map. */
	picked = $state<string | null>(null);

	async load(fetcher: typeof fetch = fetch): Promise<void> {
		if (this.status === 'loading' || this.status === 'ok') return;
		this.status = 'loading';
		try {
			const res = await fetcher('/data/travel.json');
			if (!res.ok) throw new Error(String(res.status));
			const body = (await res.json()) as {
				ministries: Ministry[];
				rows: TravelRow[];
				attribution: string | null;
			};
			this.ministries = body.ministries;
			this.rows = body.rows;
			this.attribution = body.attribution;
			this.status = 'ok';
		} catch {
			this.status = 'failed';
			return;
		}
		if (!this.borders) {
			const m = await import('#lib/data/borders.json');
			this.borders = m.default as unknown as Borders;
		}
	}

	readonly read = $derived<Ministry[]>(this.ministries.filter((m) => m.read));
	readonly ministry = $derived<Ministry | null>(
		this.read.find((m) => m.id === this.chosen) ?? this.read[0] ?? null
	);
	/** The countries of the chosen ministry on the map (`key` = the country's code, `level` = its colour). */
	readonly zones = $derived.by((): FeatureCollection => {
		const b = this.borders;
		const id = this.ministry?.id;
		if (!b || !id) return { type: 'FeatureCollection', features: [] };
		return {
			type: 'FeatureCollection',
			features: this.rows
				.filter((r) => b[r.cc] && r.marks[id])
				.map((r) => ({
					type: 'Feature',
					properties: { key: r.cc, level: r.marks[id] },
					geometry: { type: 'MultiPolygon', coordinates: b[r.cc] }
				}))
		};
	});
	/** How many countries the chosen ministry gives each colour. */
	readonly counts = $derived.by((): Record<string, number> => {
		const id = this.ministry?.id;
		const counts: Record<string, number> = {};
		for (const level of TRAVEL_LEVELS) counts[level] = 0;
		if (!id) return counts;
		for (const r of this.rows) {
			const level = r.marks[id];
			if (level && level in counts) counts[level] += 1;
		}
		return counts;
	});
	readonly pickedRow = $derived<TravelRow | null>(
		this.picked ? (this.rows.find((r) => r.cc === this.picked) ?? null) : null
	);
}
