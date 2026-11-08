// What a person chose once for their account: the units (users.prefs, read through `parsePrefs`) and the language
// (users.lang, the one of the notifications too). A value the site does not offer never reaches the database.
import { asLang, type Lang } from '#lib/i18n.js';
import { type Prefs, parsePrefs, TEMPERATURE_UNITS, WIND_UNITS, HEIGHT_UNITS } from '#lib/prefs.js';
import type { Sql } from './db';

export async function readPrefs(sql: Sql, userId: string): Promise<Prefs> {
	const [row] = await sql<{ prefs: unknown }[]>`select prefs from users where id = ${userId}`;
	return parsePrefs(row?.prefs);
}

/** What a settings form sent, as preferences: only the units it names, each one among those the site offers. A
 *  unit left out of the form (or not offered) is a unit nobody chose. */
export function prefsFromForm(form: { get(name: string): unknown }): Prefs {
	const pick = <T extends string>(allowed: readonly T[], name: string) => {
		const value = form.get(name);
		return typeof value === 'string' && (allowed as readonly string[]).includes(value)
			? { [name]: value }
			: {};
	};
	return parsePrefs({
		units: {
			...pick(TEMPERATURE_UNITS, 'temperature'),
			...pick(WIND_UNITS, 'wind'),
			...pick(HEIGHT_UNITS, 'height')
		}
	});
}

/** Replaces the units, and the language when one is given. */
export async function savePrefs(sql: Sql, userId: string, prefs: Prefs, lang?: Lang | null): Promise<void> {
	const stored = JSON.stringify(parsePrefs(prefs));
	if (lang && asLang(lang)) {
		await sql`update users set prefs = ${stored}::text::jsonb, lang = ${lang} where id = ${userId}`;
	} else {
		await sql`update users set prefs = ${stored}::text::jsonb where id = ${userId}`;
	}
}
