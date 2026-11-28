// The sky family of the home map: NOAA's aurora oval on the map and the magnetic activity of the coming day, read once when the
// family is first chosen (`/data/aurora.json`, `/data/aurora-oval.json`, the same for everybody); the estimate of the coming
// night for a place is asked by `NearSky`, as on the sky page.
import type { FeatureCollection } from 'geojson';
import type { Aurora } from '../sky';

export interface Oval {
	features: FeatureCollection;
	forecast: number | null;
	attribution: string | null;
}

export class SkyFamily {
	status = $state<'idle' | 'loading' | 'ok' | 'failed'>('idle');
	aurora = $state<Aurora | null>(null);
	oval = $state<Oval | null>(null);

	/** Reads NOAA's data once (again after a failure); one answer missing leaves the other. */
	async load(fetcher: typeof fetch = fetch): Promise<void> {
		if (this.status === 'loading' || this.status === 'ok') return;
		this.status = 'loading';
		const read = async <T>(url: string): Promise<T | null> => {
			try {
				const res = await fetcher(url);
				return res.ok ? ((await res.json()) as T) : null;
			} catch {
				return null;
			}
		};
		const [aurora, oval] = await Promise.all([
			read<Aurora>('/data/aurora.json'),
			read<Oval>('/data/aurora-oval.json')
		]);
		this.aurora = aurora;
		this.oval = oval;
		this.status = aurora || oval ? 'ok' : 'failed';
	}
}
