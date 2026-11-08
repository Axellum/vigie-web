// The words of the pages of the places of the coast (`/sea/places`, `/sea/places/<id>`), in French and English. The words of the
// verdicts and of the activities are those of `activities.ts`, the ones around a spot's verdicts those of `text.ts`; only what a
// catalogue of places adds is here. A catalogue is not a forecast, and the texts say so before anything else.
import type { Lang } from '../i18n';
import type { PlaceType, SeaPlace } from './places';

const TEXT = {
	fr: {
		page: 'Lieux du littoral',
		title: 'Les lieux du littoral',
		intro:
			'Ports, cales de mise à l’eau, mouillages, sites de plongée et de baignade de la France métropolitaine, d’après OpenStreetMap, le Sandre et le ministère de la Santé. Un catalogue : il dit où sont les lieux, pas s’ils sont ouverts ni s’il faut y aller aujourd’hui.',
		meta: 'Ports, cales de mise à l’eau, mouillages, sites de plongée et de baignade du littoral français, avec leur position. Un catalogue, pas une prévision.',
		'metaPlace.port':
			'{title} : port du littoral français, d’après le Sandre et OpenStreetMap. Un catalogue, pas une prévision.',
		'metaPlace.slipway':
			'{title} : cale de mise à l’eau d’après OpenStreetMap. Un catalogue, pas une prévision ni une autorisation.',
		'metaPlace.anchorage':
			'{title} : zone de mouillage d’après OpenStreetMap. Un catalogue, pas une prévision ni une autorisation.',
		'metaPlace.dive':
			'{title} : site de plongée d’après OpenStreetMap. Un catalogue, pas une prévision ni une autorisation.',
		'metaPlace.bathing':
			'{title} : site de baignade et classe de son eau sur 2021 à 2024. Le classement de la saison, pas l’eau d’aujourd’hui.',
		'type.port': 'Port',
		'type.slipway': 'Cale de mise à l’eau',
		'type.anchorage': 'Mouillage',
		'type.dive': 'Site de plongée',
		'type.bathing': 'Site de baignade',
		'types.port': 'Ports',
		'types.slipway': 'Cales',
		'types.anchorage': 'Mouillages',
		'types.dive': 'Plongée',
		'types.bathing': 'Baignade',
		unnamed: '{type} près de {near}',
		unnamedAt: '{type} ({lat}, {lon})',
		filterAll: 'Tous',
		filters: 'Genre de lieu',
		searchLabel: 'Un nom ou une commune',
		searchGo: 'Chercher',
		start:
			'Choisissez un genre de lieu, cherchez un nom ou une commune, ou partez de votre position : le catalogue compte {count} lieux.',
		'count.one': '1 lieu',
		'count.many': '{count} lieux',
		none: 'Aucun lieu ne correspond.',
		noneHint: 'Essayez un autre mot, sans accent si besoin, ou un autre genre de lieu.',
		unavailable: 'Le catalogue des lieux ne répond pas pour le moment.',
		unavailableHint: 'Réessayez dans quelques minutes ; aucun lieu n’est inventé.',
		pageOf: 'Page {page} sur {pages}',
		previous: 'Précédent',
		next: 'Suivant',
		locate: 'Autour de ma position',
		locating: 'Recherche de la position…',
		locateFailed: 'La position n’a pas pu être lue : elle n’est demandée que sur un clic.',
		locateNote:
			'La position reste dans votre navigateur ; seule une position arrondie à un kilomètre est envoyée au site, le temps de chercher les lieux proches. Un lieu suivi dans « Autour de moi » est repris tout seul.',
		around: 'Autour de {place}',
		myPosition: 'ma position',
		stopLocate: 'Sans position',
		searching: 'Recherche des lieux proches…',
		away: 'à {km} km',
		back: 'Les lieux du littoral',
		safety:
			'Un catalogue, pas une prévision : rien ici ne dit qu’on peut y aller aujourd’hui. Regardez la mer, les drapeaux et les sauveteurs avant d’y aller.',
		whatIs: 'Ce que c’est',
		'about.port':
			'Port d’après le Sandre ou OpenStreetMap. Vigie ne connaît ni la profondeur, ni les places, ni les horaires.',
		'about.slipway':
			'Cale de mise à l’eau d’après OpenStreetMap. Vigie ne connaît ni l’accès, ni le tarif, ni l’état : une cale qui n’est pas marquée fermée peut l’être en réalité.',
		'about.anchorage':
			'Zone de mouillage d’après OpenStreetMap. C’est une zone portée sur une carte, pas une autorisation de mouiller : le fond, l’abri et la réglementation ne sont pas connus.',
		'about.dive':
			'Site de plongée d’après OpenStreetMap. Vigie ne connaît ni la profondeur, ni le courant, ni la visibilité, ni l’accès.',
		'about.bathing': 'Site de baignade suivi par les autorités sanitaires.',
		uses: 'Usages : {list}.',
		'use.leisure': 'plaisance',
		'use.fishing': 'pêche',
		'use.passengers': 'passagers',
		'use.trade': 'commerce',
		'use.oil': 'hydrocarbures',
		'use.military': 'militaire',
		quality: 'Qualité de l’eau, 2021 à 2024',
		'quality.excellent': 'Excellente',
		'quality.good': 'Bonne',
		'quality.sufficient': 'Suffisante',
		'quality.poor': 'Insuffisante',
		'quality.unclassified': 'Non classée',
		qualityNote:
			'C’est la classe de l’eau de ce site sur les saisons 2021 à 2024, pas l’état de l’eau aujourd’hui. Les drapeaux, l’affichage de la commune et les sauveteurs restent la référence.',
		position: 'Position',
		positionNote: 'Donnée par la source, sans garantie de précision.',
		openMap: 'Voir sur OpenStreetMap',
		answerTitle: 'Y aller aujourd’hui ?',
		answerHonest:
			'Vigie ne juge pas ce lieu : ses verdicts sont ceux des spots de surf de l’Atlantique et de la Manche. Voici ce qu’ils disent autour de lui.',
		answerNone: 'Aucun spot jugé à moins de {radius} km de ce lieu.',
		answerSpot: 'Le spot jugé le plus proche est {name}, à {km} km.',
		answerSpotOpen: 'Le détail de {name}',
		allSpots: 'Tous les spots pour cette activité',
		nearbyTitle: 'Autour de ce lieu',
		nearbyNone: 'Rien d’autre dans le catalogue à moins de {radius} km.',
		nearbyMore: '+ {count} autres',
		updated: 'Catalogue construit le {date}.',
		'licenceRole.bathing quality': 'qualité des baignades',
		licenceTitle: 'Données et licences'
	},
	en: {
		page: 'Places of the coast',
		title: 'The places of the coast',
		intro:
			'Ports, slipways, anchorages, dive sites and bathing sites of mainland France, from OpenStreetMap, the Sandre and the Ministry of Health. A catalogue: it says where the places are, not whether they are open nor whether to go today.',
		meta: 'Ports, slipways, anchorages, dive sites and bathing sites of the French coast, with their position. A catalogue, not a forecast.',
		'metaPlace.port':
			'{title}: a port of the French coast, from the Sandre and OpenStreetMap. A catalogue, not a forecast.',
		'metaPlace.slipway':
			'{title}: a slipway from OpenStreetMap. A catalogue, not a forecast nor a permission.',
		'metaPlace.anchorage':
			'{title}: an anchorage from OpenStreetMap. A catalogue, not a forecast nor a permission.',
		'metaPlace.dive':
			'{title}: a dive site from OpenStreetMap. A catalogue, not a forecast nor a permission.',
		'metaPlace.bathing':
			'{title}: a bathing site and the class of its water over 2021 to 2024. The class of the seasons, not the water of today.',
		'type.port': 'Port',
		'type.slipway': 'Slipway',
		'type.anchorage': 'Anchorage',
		'type.dive': 'Dive site',
		'type.bathing': 'Bathing site',
		'types.port': 'Ports',
		'types.slipway': 'Slipways',
		'types.anchorage': 'Anchorages',
		'types.dive': 'Diving',
		'types.bathing': 'Bathing',
		unnamed: '{type} near {near}',
		unnamedAt: '{type} ({lat}, {lon})',
		filterAll: 'All',
		filters: 'Kind of place',
		searchLabel: 'A name or a town',
		searchGo: 'Search',
		start:
			'Choose a kind of place, search a name or a town, or start from your position: the catalogue holds {count} places.',
		'count.one': '1 place',
		'count.many': '{count} places',
		none: 'No place matches.',
		noneHint: 'Try another word, without accents if need be, or another kind of place.',
		unavailable: 'The catalogue of places is not answering at the moment.',
		unavailableHint: 'Try again in a few minutes; no place is made up.',
		pageOf: 'Page {page} of {pages}',
		previous: 'Previous',
		next: 'Next',
		locate: 'Around my position',
		locating: 'Finding the position…',
		locateFailed: 'The position could not be read: it is only asked for on a click.',
		locateNote:
			'The position stays in your browser; only a position rounded to a kilometre is sent to the site, for as long as it takes to look for the places nearby. A place followed in “Near me” is taken up by itself.',
		around: 'Around {place}',
		myPosition: 'my position',
		stopLocate: 'Without a position',
		searching: 'Looking for the places nearby…',
		away: '{km} km away',
		back: 'The places of the coast',
		safety:
			'A catalogue, not a forecast: nothing here says you can go today. Look at the sea, the flags and the lifeguards before going.',
		whatIs: 'What it is',
		'about.port':
			'A port from the Sandre or OpenStreetMap. Vigie knows neither the depth, the berths nor the opening hours.',
		'about.slipway':
			'A slipway from OpenStreetMap. Vigie knows neither the access, the fee nor the state: a slipway that is not marked closed may be closed in fact.',
		'about.anchorage':
			'An anchorage from OpenStreetMap. It is an area drawn on a map, not a permission to anchor: the bottom, the shelter and the rules are not known.',
		'about.dive':
			'A dive site from OpenStreetMap. Vigie knows neither the depth, the current, the visibility nor the access.',
		'about.bathing': 'A bathing site followed by the health authorities.',
		uses: 'Uses: {list}.',
		'use.leisure': 'pleasure boats',
		'use.fishing': 'fishing',
		'use.passengers': 'passengers',
		'use.trade': 'trade',
		'use.oil': 'oil',
		'use.military': 'military',
		quality: 'Water quality, 2021 to 2024',
		'quality.excellent': 'Excellent',
		'quality.good': 'Good',
		'quality.sufficient': 'Sufficient',
		'quality.poor': 'Poor',
		'quality.unclassified': 'Not classified',
		qualityNote:
			'This is the class of the water of this site over the seasons 2021 to 2024, not the state of the water today. The flags, the notices of the town and the lifeguards remain the reference.',
		position: 'Position',
		positionNote: 'As the source gives it, with no guarantee of precision.',
		openMap: 'See it on OpenStreetMap',
		answerTitle: 'Go there today?',
		answerHonest:
			'Vigie does not judge this place: its verdicts are those of the surf spots of the Atlantic and the Channel. Here is what they say around it.',
		answerNone: 'No judged spot within {radius} km of this place.',
		answerSpot: 'The nearest judged spot is {name}, {km} km away.',
		answerSpotOpen: 'The detail of {name}',
		allSpots: 'All the spots for this activity',
		nearbyTitle: 'Around this place',
		nearbyNone: 'Nothing else in the catalogue within {radius} km.',
		nearbyMore: '+ {count} more',
		updated: 'Catalogue built on {date}.',
		'licenceRole.bathing quality': 'bathing quality',
		licenceTitle: 'Data and licences'
	}
} as const;

export type PlacesKey = keyof (typeof TEXT)['fr'];
/** The texts of the places pages, so that a test can check that both languages have every one. */
export const PLACES_TEXT = TEXT;

export function placesText(
	lang: Lang,
	key: PlacesKey | string,
	vars: Record<string, string | number> = {}
): string {
	const table = TEXT[lang] as Record<string, string>;
	let text = table[key] ?? (TEXT.fr as Record<string, string>)[key] ?? key;
	for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
	return text;
}

/**
 * The licence line of the API (`ODbL-1.0 (OpenStreetMap), Licence Ouverte (Sandre), Licence Ouverte 2.0 (bathing quality)`) is the
 * names of licences, which are proper names and stay as they are, and in brackets the part of the catalogue each one covers, which is
 * English prose. The parts we know (`licenceRole.*`) are said in the language of the page; any other stays as the API gives it.
 */
export function licenceText(lang: Lang, licence: string): string {
	const table = TEXT[lang] as Record<string, string>;
	return licence.replace(/\(([^()]+)\)/g, (whole, role: string) => {
		const said = table[`licenceRole.${role}`];
		return said ? `(${said})` : whole;
	});
}

/** The name of a place as a title: its own name, else its kind and the nearest locality, else its kind and position. */
export function placeTitle(
	lang: Lang,
	place: Pick<SeaPlace, 'type' | 'name' | 'near' | 'lat' | 'lon'>
): string {
	if (place.name) return place.name;
	const type = placesText(lang, `type.${place.type}`);
	if (place.near) return placesText(lang, 'unnamed', { type, near: place.near });
	return placesText(lang, 'unnamedAt', { type, lat: place.lat.toFixed(3), lon: place.lon.toFixed(3) });
}

/** The words after a title: the commune, or the locality when the place has a name and the locality is not the commune. */
export function placeWhere(place: Pick<SeaPlace, 'name' | 'near' | 'commune'>): string | null {
	const parts = [place.commune, place.name && place.near && place.near !== place.commune ? place.near : null];
	const text = parts.filter(Boolean).join(' · ');
	return text || null;
}

export const typeLabel = (lang: Lang, type: PlaceType): string => placesText(lang, `type.${type}`);

/** A date in Paris, in words (`8 novembre 2026`): when the catalogue was built. */
export function dateLabel(lang: Lang, unix: number): string {
	return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
		timeZone: 'Europe/Paris',
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	}).format(unix * 1000);
}
