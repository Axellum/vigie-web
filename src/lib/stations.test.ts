import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	spotStationFromApi,
	stationSpeedDiffText,
	stationText,
	stationWindText,
	windModelLabel
} from './stations';

const fixture = (name: string) =>
	JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'e2e', 'fixtures', name), 'utf-8'));

describe('coastal 6-minute Météo-France station', () => {
	const raw = fixture('surf-station-hossegor.json');

	it('parses station details, 6-minute measurements, wind comparison, and attribution', () => {
		const parsed = spotStationFromApi(raw)!;
		expect(parsed).not.toBeNull();
		expect(parsed.status).toBe('ok');
		expect(parsed.spotId).toBe('soorts-hossegor-plage-sud-point-d-or');
		expect(parsed.comparable).toBe(true);
		expect(parsed.station?.name).toBeTruthy();
		expect(parsed.measure?.windSpeedKmh).toBeTypeOf('number');
		expect(parsed.comparison?.status).toBe('ok');
		expect(parsed.attribution).toBeTruthy();
		expect(parsed.derived.length).toBeGreaterThan(0);
	});

	it('preserves non-ok fallback states without fabricating observations', () => {
		for (const status of ['not_configured', 'unavailable', 'no_current_reading'] as const) {
			const fallback = spotStationFromApi({
				spot_id: 'spot-1',
				status,
				station: status === 'no_current_reading' ? { id: '40001001', name: 'Capbreton' } : null,
				measure: null,
				comparison: null,
				max_age_hours: 3
			})!;
			expect(fallback.status).toBe(status);
			expect(fallback.measure).toBeNull();
			expect(fallback.comparison).toBeNull();
			expect(fallback.comparable).toBe(false);
		}
		expect(spotStationFromApi(null)).toBeNull();
	});

	it('formats wind speed and signed speed differences in km/h and knots for FR and EN', () => {
		expect(stationWindText('fr', 24, 'kmh')).toBe('24 km/h');
		expect(stationWindText('en', 24, 'kmh')).toBe('24 km/h');
		expect(stationWindText('en', 18.52, 'kn')).toBe('10 kn');
		expect(stationSpeedDiffText('fr', 3.4, 'kmh')).toBe('+3 km/h');
		expect(stationSpeedDiffText('en', -3.704, 'kn')).toBe('-2 kn');
		expect(stationWindText('fr', null, 'kmh')).toBeNull();
		expect(stationSpeedDiffText('en', null, 'kn')).toBeNull();
	});

	it('provides localized station labels in FR and EN', () => {
		expect(stationText('fr', 'title')).toContain('6 min');
		expect(stationText('en', 'title')).toContain('6 min');
		expect(stationText('fr', 'comparable', { max: 25 })).toContain('25 km');
		expect(stationText('en', 'noCurrentReading', { hours: 3 })).toContain('3 h');
	});
});

describe('windModelLabel', () => {
	it('says in French the forecast the recorded answer compares with, and leaves an unknown one as the API gives it', () => {
		const model = fixture('surf-station-hossegor.json').comparison.wind_model as string;
		expect(windModelLabel('fr', model)).not.toBe(model);
		expect(windModelLabel('en', model)).toBe(model);
		expect(windModelLabel('fr', 'Some new model')).toBe('Some new model');
	});
});
