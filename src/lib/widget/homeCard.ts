// The home face of the widget page draws the Home Assistant card of vigie-api (`static/ha-card/vigie-card.js`, copied by
// scripts/sync-ha-card.mjs) without Home Assistant: the page plays the part of Home Assistant for it. The card asks its data
// with the WebSocket command `vigie/card/data` of the integration; the page answers with the same shape (vigie-api,
// `custom_components/vigie/websocket.py`, `ws_card_data`): the whole answer of `/v1/point` for the cell of the place, and the
// official warnings the page has already matched against the place (the ones its summary tells the desktop app, so that the
// card and the icon near the clock never say two different things). What its home and Details pages do not read is left `null`.
import type { Lang } from '../i18n';
import type { WarningHere } from '../near';
import type { OfficialState } from '../sentence';

/** One warning as the integration describes it (`Vigilance.summary`): absent values are left out. */
export interface CardVigilance {
	id: string;
	source: string;
	country: string;
	level: 'green' | 'yellow' | 'orange' | 'red';
	phenomenon?: string;
	headline?: string;
	event?: string;
	area?: string;
	onset?: string;
	expires?: string;
}

/** The warnings of the place as the integration gives them to the card. */
export interface CardWarnings {
	/** `yellow`, `orange`, `red`, `none`; null when it cannot be told (still loading, failed, no source). */
	max_level: 'yellow' | 'orange' | 'red' | 'none' | null;
	server_utc: number;
	/** Set when no official source covers the place: the card then says so instead of "warnings unknown". */
	note: string | null;
	attribution: string | null;
	vigilances: CardVigilance[];
}

/** What `vigie/card/data` answers. */
export interface CardData {
	entry_id: string;
	title: string;
	language: Lang;
	read_utc: number | null;
	point: unknown;
	tides: null;
	normals: null;
	station_wind: null;
	forest_fire: null;
	warnings: CardWarnings | null;
	earthquakes: null;
	spot: null;
	activities: null;
}

/** What `/data/card.json` answers. */
export interface CardAnswer {
	point: unknown;
	read_utc: number | null;
	stale?: boolean;
}

const RANK = { green: 0, yellow: 1, orange: 2, red: 3 } as const;
type CardLevel = keyof typeof RANK;
const iso = (s: number | null) => (s == null ? undefined : new Date(s * 1000).toISOString());

/** The text of a warning in the language asked for, else English, else the first one (the integration's `best_text`). */
function bestText(texts: WarningHere['warning']['texts'], lang: Lang) {
	return (
		texts.find((t) => (t.language ?? '').toLowerCase().split('-')[0] === lang) ??
		texts.find((t) => (t.language ?? '').toLowerCase().split('-')[0] === 'en') ??
		texts[0] ??
		null
	);
}

/**
 * The warnings of the place for the card, from what the page matched (`PlaceWidget.official` and `.here`). A warning past
 * its end is left out, as the widget's summary leaves it out; its end is `ends`, else `expires` (the end of the bulletin), the
 * end the summary gives the desktop app.
 */
export function cardWarnings(
	state: OfficialState,
	here: WarningHere[],
	lang: Lang,
	now: number,
	attribution: string | null
): CardWarnings {
	const live = here.filter((h) => {
		const end = h.warning.ends ?? h.warning.expires;
		return end == null || end > now;
	});
	const vigilances: CardVigilance[] = [];
	for (const { warning: w } of live) {
		const level = w.level?.toLowerCase() as CardLevel | undefined;
		if (!level || !(level in RANK)) continue;
		const text = bestText(w.texts, lang);
		const headline = text?.headline ?? text?.event ?? undefined;
		const event = text?.event && text.event !== headline ? text.event : undefined;
		const item: CardVigilance = {
			id: w.apiId ?? w.id,
			source: w.source,
			country: w.cc,
			level,
			phenomenon: w.phenomenon ?? undefined,
			headline,
			event,
			area: w.area ?? undefined,
			onset: iso(w.onset),
			expires: iso(w.ends ?? w.expires)
		};
		vigilances.push(
			Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined)) as unknown as CardVigilance
		);
	}
	vigilances.sort((a, b) => RANK[b.level] - RANK[a.level]);
	let max: CardWarnings['max_level'] = null;
	if (state === 'warnings' || state === 'none') {
		const top = Math.max(-1, ...vigilances.map((v) => RANK[v.level]));
		max = top >= RANK.yellow ? (['none', 'yellow', 'orange', 'red'] as const)[top] : 'none';
	}
	return {
		max_level: max,
		server_utc: now,
		note: state === 'nosource' ? 'No official source of warnings covers this place.' : null,
		attribution,
		vigilances
	};
}

/** The answer of `vigie/card/data` for the place. */
export function cardData(input: {
	name: string;
	lang: Lang;
	answer: CardAnswer;
	warnings: CardWarnings | null;
}): CardData {
	return {
		entry_id: 'widget',
		title: input.name,
		language: input.lang,
		read_utc: input.answer.read_utc,
		point: input.answer.point,
		tides: null,
		normals: null,
		station_wind: null,
		forest_fire: null,
		warnings: input.warnings,
		earthquakes: null,
		spot: null,
		activities: null
	};
}

/**
 * The part of Home Assistant the card reads (`set hass`): its language, light or dark, and `callWS`. The card subscribes to
 * nothing without `connection`, and reads `states` only for a weather entity, which the page never names.
 */
export function fakeHass(lang: Lang, dark: boolean, answer: () => CardData | null) {
	return {
		language: lang,
		locale: { language: lang },
		themes: { darkMode: dark },
		states: {},
		async callWS(message: { type?: string }) {
			if (message?.type !== 'vigie/card/data') throw { code: 'unknown_command' };
			const data = answer();
			if (!data) throw { code: 'error' };
			return data;
		}
	};
}
