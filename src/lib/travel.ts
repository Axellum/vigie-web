// Travel advice: the Vigie API's `/v1/travel`, `/v1/travel/{cc}` and `/v1/travel/health`. Pure functions: no network, no clock.
// Two kinds of values, never mixed: what a ministry or the ECDC publishes, shown in its own words and language, and what
// Vigie works out (the common scale, the comparison, the colours of the map, the labels of the FCDO's statuses, the
// countries an ECDC item names), always said to be Vigie's. A value the API did not give stays null.
import type { Lang } from './i18n';
import type { Level } from './types';

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === 'string');
const words = (v: unknown): Record<string, string> =>
	Object.fromEntries(Object.entries(obj(v)).filter((e): e is [string, string] => typeof e[1] === 'string'));

/** The FCDO's alert statuses, as the API gives them (`ministries[].statuses`). */
export const GB_STATUSES = [
	'avoid_all_travel_to_whole_country',
	'avoid_all_but_essential_travel_to_whole_country',
	'avoid_all_travel_to_parts',
	'avoid_all_but_essential_travel_to_parts'
] as const;

export interface ScaleStep {
	level: number;
	words: Record<string, string>;
}

export interface Ministry {
	id: string;
	name: string;
	/** The country that issues the advice (ISO alpha-2). */
	country: string;
	url: string | null;
	read: boolean;
	whyNotRead: string | null;
	levels: ScaleStep[];
	state: string | null;
	attribution: string | null;
}

export interface Comparison {
	compared: string[];
	disagree: boolean | null;
	gap: number | null;
	strictest: string[];
	laxest: string[];
}

export interface AdviceLevel {
	ministry: string;
	title: string;
	/** Vigie's: the advice is for a part of the country only (the Azores, Gaza). */
	part: boolean;
	level: number | null;
	statuses: string[];
	regional: boolean | null;
	commonMin: number | null;
	commonMax: number | null;
	published: number | null;
	publishedText: string | null;
	checked: number | null;
}

export interface TravelCountry {
	country: string;
	advices: AdviceLevel[];
	comparison: Comparison;
}

export interface Overview {
	generated: number;
	ministries: Ministry[];
	countries: TravelCountry[];
	attribution: string | null;
}

/** A paragraph, a heading or a list item of a text, its words as given. */
export interface Block {
	kind: 'h' | 'p' | 'li';
	text: string;
}

export interface Text {
	language: string;
	title: string | null;
	blocks: Block[];
}

export interface Advice extends AdviceLevel {
	url: string | null;
	levelTexts: Record<string, string>;
	texts: Text[];
	changeNote: Text[];
	sourceHistory: { published: number | null; note: string }[];
	attribution: string | null;
}

export interface Change {
	ministry: string;
	title: string;
	observed: number;
	first: boolean;
	levelChanged: boolean | null;
	level: number | null;
	levelTexts: Record<string, string>;
	statuses: string[];
	published: number | null;
	publishedText: string | null;
}

export interface HealthItem {
	kind: string;
	title: string;
	url: string;
	summary: Block[];
	published: number | null;
	/** Vigie's: the countries whose name the title or the summary contains. */
	countries: string[] | null;
}

export interface Agency {
	id: string;
	name: string;
	url: string | null;
	read: boolean;
	whyNotRead: string | null;
	state: string | null;
}

export interface Health {
	agencies: Agency[];
	items: HealthItem[];
	attribution: string | null;
}

export interface CountryDetail {
	generated: number;
	country: string;
	/** The API's English name of the country; null for a code it does not know. */
	name: string | null;
	advices: Advice[];
	comparison: Comparison;
	history: Change[];
	historySince: number | null;
	notCovered: string[];
	ministries: Ministry[];
	attribution: string | null;
	health: Health | null;
}

// --- The ministries' HTML, as words -------------------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	ndash: '–',
	mdash: '—',
	lsquo: '‘',
	rsquo: '’',
	ldquo: '“',
	rdquo: '”',
	laquo: '«',
	raquo: '»',
	hellip: '…',
	bull: '•',
	middot: '·',
	deg: '°',
	euro: '€',
	pound: '£',
	copy: '©',
	eacute: 'é',
	egrave: 'è',
	ecirc: 'ê',
	euml: 'ë',
	agrave: 'à',
	aacute: 'á',
	acirc: 'â',
	auml: 'ä',
	ccedil: 'ç',
	icirc: 'î',
	iuml: 'ï',
	iacute: 'í',
	ocirc: 'ô',
	ouml: 'ö',
	oacute: 'ó',
	ugrave: 'ù',
	ucirc: 'û',
	uuml: 'ü',
	uacute: 'ú',
	ntilde: 'ñ',
	Eacute: 'É',
	Egrave: 'È',
	Agrave: 'À',
	Ccedil: 'Ç'
};

/** The characters of the HTML entities; an entity this table does not know stays as written. */
export function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (whole, name: string) => {
		if (name[0] === '#') {
			const code =
				name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
			return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
		}
		return ENTITIES[name] ?? whole;
	});
}

/**
 * The words of an HTML text, as paragraphs, headings and list items, without its tags: the site shows no HTML of a
 * third party. Scripts and styles are dropped (they are not words of the text); every other word is kept, in its order.
 */
export function textBlocks(html: string): Block[] {
	const marked = html
		.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/<h[1-6]\b[^>]*>/gi, '\n\u0001h ')
		.replace(/<li\b[^>]*>/gi, '\n\u0001li ')
		.replace(/<(br|hr)\b[^>]*\/?>/gi, '\n')
		.replace(/<\/?(p|div|section|article|ul|ol|li|h[1-6]|table|tr|blockquote|dl|dt|dd)\b[^>]*>/gi, '\n')
		.replace(/<[^>]*>/g, '');
	const blocks: Block[] = [];
	for (const line of marked.split('\n')) {
		let kind: Block['kind'] = 'p';
		let rest = line;
		const mark = /^\s*\u0001(h|li) /.exec(rest);
		if (mark) {
			kind = mark[1] as Block['kind'];
			rest = rest.slice(mark[0].length);
		}
		const text = decodeEntities(rest).replace(/\s+/g, ' ').trim();
		if (text) blocks.push({ kind, text });
	}
	return blocks;
}

// --- Reading the API ----------------------------------------------------------------------------------------------------

function ministryFromApi(v: unknown): Ministry | null {
	const o = obj(v);
	const id = str(o.id);
	const name = str(o.name);
	const country = str(o.country);
	if (!id || !name || !country) return null;
	return {
		id,
		name,
		country,
		url: str(o.url),
		read: o.read === true,
		whyNotRead: str(o.why_not_read),
		levels: arr(o.levels)
			.map((s) => ({ level: num(obj(s).level), words: words(obj(s).words) }))
			.filter((s): s is ScaleStep => s.level != null),
		state: str(o.state),
		attribution: str(o.attribution)
	};
}

function comparisonFromApi(v: unknown): Comparison {
	const o = obj(v);
	return {
		compared: strings(o.compared),
		disagree: bool(o.disagree),
		gap: num(o.gap),
		strictest: strings(o.strictest),
		laxest: strings(o.laxest)
	};
}

function levelFromApi(v: unknown): AdviceLevel | null {
	const o = obj(v);
	const ministry = str(o.ministry);
	const title = str(o.title);
	if (!ministry || !title) return null;
	return {
		ministry,
		title,
		part: o.part === true,
		level: num(o.level),
		statuses: strings(o.statuses),
		regional: bool(o.regional),
		commonMin: num(o.common_min),
		commonMax: num(o.common_max),
		published: num(o.published_utc),
		publishedText: str(o.published_text),
		checked: num(o.checked_utc)
	};
}

function textFromApi(v: unknown): Text | null {
	const o = obj(v);
	const content = str(o.content);
	if (!content) return null;
	const blocks =
		o.format === 'html'
			? textBlocks(content)
			: content.split(/\n+/).map((t) => ({ kind: 'p' as const, text: t.trim() }));
	return { language: str(o.language) ?? '', title: str(o.title), blocks: blocks.filter((b) => b.text) };
}

const texts = (v: unknown): Text[] =>
	arr(v)
		.map(textFromApi)
		.filter((t): t is Text => t !== null);

function adviceFromApi(v: unknown): Advice | null {
	const base = levelFromApi(v);
	if (!base) return null;
	const o = obj(v);
	return {
		...base,
		url: str(o.url),
		levelTexts: words(o.level_texts),
		texts: texts(o.summary),
		changeNote: texts(o.change_note),
		sourceHistory: arr(o.source_history)
			.map((c) => ({ published: num(obj(c).published_utc), note: str(obj(c).note) }))
			.filter((c): c is { published: number | null; note: string } => c.note !== null),
		attribution: str(o.attribution)
	};
}

function changeFromApi(v: unknown): Change | null {
	const o = obj(v);
	const ministry = str(o.ministry);
	const title = str(o.title);
	const observed = num(o.observed_utc);
	if (!ministry || !title || observed == null) return null;
	return {
		ministry,
		title,
		observed,
		first: o.first === true,
		levelChanged: bool(o.level_changed),
		level: num(o.level),
		levelTexts: words(o.level_texts),
		statuses: strings(o.statuses),
		published: num(o.published_utc),
		publishedText: str(o.published_text)
	};
}

export function healthFromApi(body: unknown): Health {
	const o = obj(body);
	return {
		agencies: arr(o.agencies)
			.map((a) => {
				const x = obj(a);
				const id = str(x.id);
				const name = str(x.name);
				return id && name
					? {
							id,
							name,
							url: str(x.url),
							read: x.read === true,
							whyNotRead: str(x.why_not_read),
							state: str(x.state)
						}
					: null;
			})
			.filter((a): a is Agency => a !== null),
		items: arr(o.items)
			.map((i) => {
				const x = obj(i);
				const title = str(x.title);
				const url = str(x.url);
				if (!title || !url) return null;
				const summary = str(obj(x.summary).content);
				return {
					kind: str(x.kind) ?? '',
					title,
					url,
					summary: summary ? textBlocks(summary) : [],
					published: num(x.published_utc),
					countries: Array.isArray(x.countries) ? strings(x.countries) : null
				};
			})
			.filter((i): i is HealthItem => i !== null),
		attribution: str(o.attribution)
	};
}

const isCode = (v: string | null): v is string => v !== null && /^[A-Z]{2}$/.test(v);

export function overviewFromApi(body: unknown): Overview {
	const o = obj(body);
	return {
		generated: num(o.generated_utc) ?? 0,
		ministries: arr(o.ministries)
			.map(ministryFromApi)
			.filter((m): m is Ministry => m !== null),
		countries: arr(o.countries)
			.map((c) => {
				const x = obj(c);
				const country = str(x.country);
				if (!isCode(country)) return null;
				return {
					country,
					advices: arr(x.advices)
						.map(levelFromApi)
						.filter((a): a is AdviceLevel => a !== null),
					comparison: comparisonFromApi(x.comparison)
				};
			})
			.filter((c): c is TravelCountry => c !== null),
		attribution: str(o.attribution)
	};
}

export function countryFromApi(body: unknown): CountryDetail | null {
	const o = obj(body);
	const country = str(o.country);
	if (!isCode(country)) return null;
	return {
		generated: num(o.generated_utc) ?? 0,
		country,
		name: str(o.name),
		advices: arr(o.advices)
			.map(adviceFromApi)
			.filter((a): a is Advice => a !== null),
		comparison: comparisonFromApi(o.comparison),
		history: arr(o.history)
			.map(changeFromApi)
			.filter((c): c is Change => c !== null),
		historySince: num(o.history_since_utc),
		notCovered: strings(o.not_covered),
		ministries: arr(o.ministries)
			.map(ministryFromApi)
			.filter((m): m is Ministry => m !== null),
		attribution: str(o.attribution),
		health: o.health ? healthFromApi(o.health) : null
	};
}

// --- Vigie's own: colours, labels, words --------------------------------------------------------------------------------

const STEP: Record<number, Level> = { 1: 'GREEN', 2: 'YELLOW', 3: 'ORANGE', 4: 'RED' };

/**
 * The colour of an advice on the map of one ministry (Vigie's choice, shown with the ministry's words in the legend): a
 * numbered ministry's step 1 to 4 is green to red; the FCDO's statuses give red (all travel, whole country), orange (all
 * but essential, whole country), yellow (parts of the country) and green (no advice against travel). Null when unknown.
 */
export function mapLevel(
	advice: Pick<AdviceLevel, 'ministry' | 'level' | 'statuses' | 'commonMin'>
): Level | null {
	if (advice.ministry === 'gb') {
		if (advice.statuses.includes('avoid_all_travel_to_whole_country')) return 'RED';
		if (advice.statuses.includes('avoid_all_but_essential_travel_to_whole_country')) return 'ORANGE';
		if (advice.statuses.some((s) => s.endsWith('_to_parts'))) return 'YELLOW';
		return advice.commonMin != null ? 'GREEN' : null;
	}
	return advice.level != null ? (STEP[advice.level] ?? null) : null;
}

/** The advice of a ministry for the whole country (not a part of it), when it publishes exactly one. */
export function wholeCountry<T extends AdviceLevel>(advices: T[], ministry: string): T | null {
	const whole = advices.filter((a) => a.ministry === ministry && !a.part);
	return whole.length === 1 ? whole[0] : null;
}

/** A text in the page's language when the ministry gives one, else in the first language it gives. */
export function inLanguage(
	lang: Lang,
	texts: Record<string, string>
): { text: string; language: string } | null {
	if (texts[lang]) return { text: texts[lang], language: lang };
	const first = Object.entries(texts)[0];
	return first ? { text: first[1], language: first[0] } : null;
}

/** A ministry's words for a step of its scale (the overview gives the step only). */
export function stepWords(lang: Lang, ministry: Ministry | undefined, level: number | null) {
	if (!ministry || level == null) return null;
	const step = ministry.levels.find((s) => s.level === level);
	return step ? inLanguage(lang, step.words) : null;
}

/** Vigie's label of the FCDO's statuses of an advice (the FCDO publishes no short wording of its own in its feed). */
export function statusLabel(lang: Lang, statuses: string[]): string {
	if (!statuses.length) return travel(lang, 'status.none');
	return statuses
		.filter((s): s is (typeof GB_STATUSES)[number] => (GB_STATUSES as readonly string[]).includes(s))
		.sort((a, b) => GB_STATUSES.indexOf(a) - GB_STATUSES.indexOf(b))
		.map((s) => travel(lang, `status.${s}`))
		.join(' · ');
}

/** The legend of a ministry's map: each colour with the ministry's words (or Vigie's labels for the FCDO). */
export function legend(
	lang: Lang,
	ministry: Ministry
): { level: Level; text: string; language: string; ours: boolean }[] {
	if (ministry.id === 'gb')
		return (
			[
				['RED', 'status.avoid_all_travel_to_whole_country'],
				['ORANGE', 'status.avoid_all_but_essential_travel_to_whole_country'],
				['YELLOW', 'status.parts'],
				['GREEN', 'status.none']
			] as const
		).map(([level, key]) => ({ level, text: travel(lang, key), language: lang, ours: true }));
	return ministry.levels
		.map((s) => {
			const level = STEP[s.level];
			const w = inLanguage(lang, s.words);
			return level && w ? { level, text: w.text, language: w.language, ours: false } : null;
		})
		.filter((x): x is { level: Level; text: string; language: string; ours: boolean } => x !== null);
}

/** A date of publication with its year (an advice can stay for months), in UTC: the time of day is not what matters here. */
export function travelDate(lang: Lang, unix: number | null): string {
	if (unix == null) return '–';
	return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(unix * 1000));
}

/** Why a ministry or an agency is not read, in the page's language when the site has the sentence, else the API's. */
export function whyNotRead(lang: Lang, item: { id: string; whyNotRead: string | null }): string {
	const key = `notRead.${item.id}`;
	return key in TEXT.fr ? travel(lang, key as TravelKey) : (item.whyNotRead ?? '');
}

/** The kind of an ECDC publication, in the page's language; the API's word when the site does not know it. */
export function kindLabel(lang: Lang, kind: string): string {
	const key = `kind.${kind}`;
	return key in TEXT.fr ? travel(lang, key as TravelKey) : kind;
}

/** The name of a language in the page's language ("anglais", "Dutch"); the code itself when unknown. */
export function languageName(lang: Lang, code: string): string {
	try {
		return new Intl.DisplayNames([lang], { type: 'language' }).of(code) ?? code;
	} catch {
		return code;
	}
}

// --- The page's own texts -----------------------------------------------------------------------------------------------

const TEXT = {
	fr: {
		nav: 'Voyager',
		page: 'Conseils aux voyageurs',
		pageIntro:
			'Ce que cinq ministères des Affaires étrangères conseillent à leurs ressortissants, pays par pays, dans leurs propres mots. Lisez la page du ministère avant de partir.',
		countryTitle: '{country} : conseils aux voyageurs',
		countryDescription:
			'Les conseils de cinq ministères des Affaires étrangères pour {country}, côte à côte.',
		mapOf: 'Carte des avis de :',
		mapNote: 'Couleurs choisies par Vigie ; chaque couleur porte les mots du ministère.',
		oursLabel: 'libellé de Vigie',
		search: 'Chercher un pays',
		countries: 'Tous les pays',
		country: 'Pays',
		disagreements: 'Les ministères ne sont pas d’accord',
		disagreementsNote:
			'Comparaison de Vigie sur une échelle commune de 1 (précautions normales) à 4 (éviter tout voyage), pas un niveau officiel. Seuls les avis pour tout le pays sont comparés.',
		disagree: 'Désaccord : {gap} niveau(x) d’écart',
		disagreeDetail: 'Le plus strict : {strict}. Le moins strict : {lax}.',
		agree: 'Les ministères comparés sont d’accord (échelle de Vigie).',
		notCompared: 'Moins de deux avis comparables : pas de comparaison.',
		noAdvice: 'Aucun des ministères lus ne publie d’avis pour ce pays.',
		published: 'publié le',
		checked: 'relu par Vigie',
		readOn: 'Lire l’avis sur le site du ministère',
		text: 'Texte du ministère',
		textIn: 'en {language}',
		regional: 'Avis plus strict pour certaines régions (voir le texte).',
		part: 'Avis pour une partie du pays',
		notCovered: 'Pas d’avis publié pour ce pays par :',
		notRead: 'Ministères non lus',
		'notRead.de':
			"Son interface de données est donnée sur demande ; la demande n'a pas encore de réponse. Lien seulement.",
		'notRead.fr': "Aucun flux vivant de ses conseils n'a été trouvé. Lien seulement.",
		history: 'Historique',
		historyNote: 'Versions relues par Vigie depuis le {date} (archivées par Vigie, pas par les ministères).',
		historyFirst: 'première version relue',
		historyChanged: 'niveau changé',
		changeNote: 'Dernière modification, selon le ministère :',
		sourceHistory: 'Historique publié par le FCDO',
		unknown: 'inconnu',
		unavailable: 'Les conseils aux voyageurs ne répondent pas pour l’instant.',
		loading: 'en cours de lecture',
		stale: 'dernière version relue (le ministère ne répond pas)',
		health: 'Santé',
		healthIntro:
			"Les publications récentes de l'ECDC (Centre européen de prévention et de contrôle des maladies) sur les menaces de maladies transmissibles, dans leurs mots.",
		healthCountry: 'Publications récentes de l’ECDC qui nomment ce pays',
		healthMatched:
			'Pays repérés par Vigie d’après leur nom dans le titre ou le résumé : un pays peut être nommé pour une autre raison qu’une menace sur place.',
		healthNone: 'Aucune publication récente de l’ECDC ne nomme ce pays.',
		healthAlso: 'À consulter aussi (lien seulement) :',
		'notRead.who': 'Ses conditions n’autorisent pas une reprise commerciale de son site.',
		'notRead.cdc':
			'La plupart de ses pages sont libres, mais pas toutes, et une alerte ne dit pas lesquelles.',
		'kind.epidemiological_update': 'Point épidémiologique',
		'kind.risk_assessment': 'Évaluation du risque',
		'kind.threats_report': 'Rapport hebdomadaire des menaces',
		allTravel: 'Tous les conseils aux voyageurs',
		'status.avoid_all_travel_to_whole_country': 'Déconseille tout voyage dans tout le pays',
		'status.avoid_all_but_essential_travel_to_whole_country':
			'Déconseille tout voyage non essentiel dans tout le pays',
		'status.avoid_all_travel_to_parts': 'Déconseille tout voyage dans certaines régions',
		'status.avoid_all_but_essential_travel_to_parts':
			'Déconseille tout voyage non essentiel dans certaines régions',
		'status.parts': 'Déconseille de voyager dans certaines régions',
		'status.none': 'Ne déconseille pas de voyager'
	},
	en: {
		nav: 'Travel',
		page: 'Travel advice',
		pageIntro:
			"What five foreign ministries advise their citizens, country by country, in their own words. Read the ministry's page before you travel.",
		countryTitle: '{country}: travel advice',
		countryDescription: 'The advice of five foreign ministries for {country}, side by side.',
		mapOf: 'Map of the advice of:',
		mapNote: "Colours chosen by Vigie; each colour carries the ministry's words.",
		oursLabel: "Vigie's label",
		search: 'Find a country',
		countries: 'Every country',
		country: 'Country',
		disagreements: 'The ministries disagree',
		disagreementsNote:
			"Vigie's comparison on a common scale from 1 (normal precautions) to 4 (avoid all travel), not an official level. Only the advice for a whole country is compared.",
		disagree: 'Disagreement: {gap} step(s) apart',
		disagreeDetail: 'Strictest: {strict}. Least strict: {lax}.',
		agree: "The ministries compared agree (Vigie's scale).",
		notCompared: 'Fewer than two comparable advices: no comparison.',
		noAdvice: 'None of the ministries read publishes advice for this country.',
		published: 'published',
		checked: 'read by Vigie',
		readOn: "Read the advice on the ministry's site",
		text: "The ministry's text",
		textIn: 'in {language}',
		regional: 'Stricter advice for some areas (see the text).',
		part: 'Advice for a part of the country',
		notCovered: 'No advice published for this country by:',
		notRead: 'Ministries not read',
		'notRead.de':
			'Its data interface is given on request; the request has not been answered yet. Linked only.',
		'notRead.fr': 'No live feed of its advice was found. Linked only.',
		history: 'History',
		historyNote: 'Versions read by Vigie since {date} (archived by Vigie, not by the ministries).',
		historyFirst: 'first version read',
		historyChanged: 'level changed',
		changeNote: 'Latest change, as the ministry gives it:',
		sourceHistory: 'History published by the FCDO',
		unknown: 'unknown',
		unavailable: 'The travel advice does not answer for now.',
		loading: 'being read',
		stale: 'last version read (the ministry does not answer)',
		health: 'Health',
		healthIntro:
			'The recent publications of the ECDC (European Centre for Disease Prevention and Control) on communicable disease threats, in its words.',
		healthCountry: 'Recent ECDC publications that name this country',
		healthMatched:
			'Countries found by Vigie from their name in the title or the summary: a country can be named for another reason than a threat there.',
		healthNone: 'No recent ECDC publication names this country.',
		healthAlso: 'See also (linked only):',
		'notRead.who': 'Its terms do not allow a commercial reuse of its website.',
		'notRead.cdc': 'Most of its pages are free to reuse, but not all, and a notice does not say which.',
		'kind.epidemiological_update': 'Epidemiological update',
		'kind.risk_assessment': 'Risk assessment',
		'kind.threats_report': 'Weekly threats report',
		allTravel: 'All the travel advice',
		'status.avoid_all_travel_to_whole_country': 'Advises against all travel to the whole country',
		'status.avoid_all_but_essential_travel_to_whole_country':
			'Advises against all but essential travel to the whole country',
		'status.avoid_all_travel_to_parts': 'Advises against all travel to parts of the country',
		'status.avoid_all_but_essential_travel_to_parts':
			'Advises against all but essential travel to parts of the country',
		'status.parts': 'Advises against travel to parts of the country',
		'status.none': 'Does not advise against travel'
	}
} as const;

export type TravelKey = keyof (typeof TEXT)['fr'];

export function travel(lang: Lang, key: TravelKey, params: Record<string, string | number> = {}): string {
	let text: string = TEXT[lang][key] ?? TEXT.fr[key];
	for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
	return text;
}

/** The two dictionaries have the same keys (for the test). */
export const TRAVEL_KEYS = { fr: Object.keys(TEXT.fr), en: Object.keys(TEXT.en) };
