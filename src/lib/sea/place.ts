// What the top of a spot's page needs from the verdicts of the four activities: the one the visitor chose, and the verdict of the
// hour that holds "now". Every figure is the API's; an hour it did not give is left out, never guessed.
import type { ActivitiesForecast, Activity, ActivityId, Verdict } from '../activities';

/** The verdict of the hour that holds `at` (night or day); null when the API gave no such hour. */
export function nowVerdict(activity: Activity, at: number): Verdict | null {
	return activity.hours.find((h) => h.t <= at && at < h.t + 3600)?.verdict ?? null;
}

/** The activity to put on top: the one wanted when this spot has it, else the first one of the answer; null for none. */
export function activityOnTop(forecast: ActivitiesForecast, wanted: ActivityId): Activity | null {
	return forecast.activities.find((a) => a.id === wanted) ?? forecast.activities[0] ?? null;
}
