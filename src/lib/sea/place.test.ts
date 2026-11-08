import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activitiesFromApi } from '../activities';
import { activityOnTop, nowVerdict } from './place';

const raw = JSON.parse(
	readFileSync(
		join(import.meta.dirname, '..', '..', '..', 'e2e', 'fixtures', 'activities-hossegor.json'),
		'utf-8'
	)
);
const v = activitiesFromApi(raw)!;

describe('the top of a spot page', () => {
	it('puts the activity the visitor chose on top, and the first one of the answer when this spot has not got it', () => {
		expect(activityOnTop(v, 'kite')?.id).toBe('kite');
		expect(activityOnTop(v, 'shore_fishing')?.id).toBe('shore_fishing');
		expect(activityOnTop({ ...v, activities: v.activities.slice(2) }, 'surf')?.id).toBe('boat');
		expect(activityOnTop({ ...v, activities: [] }, 'surf')).toBeNull();
	});

	it('gives the verdict of the hour that holds now, night or day, and nothing outside the hours it was given', () => {
		const fishing = v.activities.find((a) => a.id === 'shore_fishing')!;
		const first = fishing.hours[0];
		// The headline of the shore fishing is good (in the day to come); the first hour of the answer is poor.
		expect(fishing.verdict).toBe('good');
		expect(nowVerdict(fishing, first.t)).toBe(first.verdict);
		expect(nowVerdict(fishing, first.t + 3599)).toBe(first.verdict);
		expect(nowVerdict(fishing, first.t - 1)).toBeNull();
		const last = fishing.hours[fishing.hours.length - 1];
		expect(nowVerdict(fishing, last.t + 3600)).toBeNull();
		expect(nowVerdict({ ...fishing, hours: [] }, first.t)).toBeNull();
	});
});
