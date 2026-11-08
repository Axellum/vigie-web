// What a person chose once for their account, besides the language (users.lang): the units. Stored as a small JSON
// object, read back through `parsePrefs`, so that an old or hand-made value can never reach a page.
export const TEMPERATURE_UNITS = ['c', 'f'] as const;
export const WIND_UNITS = ['kmh', 'ms', 'kn', 'mph'] as const;
export const HEIGHT_UNITS = ['m', 'ft'] as const;

export interface Units {
	temperature: (typeof TEMPERATURE_UNITS)[number];
	wind: (typeof WIND_UNITS)[number];
	height: (typeof HEIGHT_UNITS)[number];
}

/** A key left out is the default of the language: nothing is chosen for the person. */
export interface Prefs {
	units: Partial<Units>;
}

function pick<T extends string>(allowed: readonly T[], value: unknown): T | undefined {
	return typeof value === 'string' && (allowed as readonly string[]).includes(value)
		? (value as T)
		: undefined;
}

/** The preferences from a stored value or a form; anything unknown is dropped. */
export function parsePrefs(value: unknown): Prefs {
	const stored =
		typeof value === 'object' && value !== null ? (value as { units?: unknown }).units : undefined;
	const units = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<string, unknown>;
	const out: Partial<Units> = {};
	const temperature = pick(TEMPERATURE_UNITS, units.temperature);
	const wind = pick(WIND_UNITS, units.wind);
	const height = pick(HEIGHT_UNITS, units.height);
	if (temperature) out.temperature = temperature;
	if (wind) out.wind = wind;
	if (height) out.height = height;
	return { units: out };
}
