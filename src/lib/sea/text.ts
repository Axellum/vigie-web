// The words of the sea pages (`/sea`, `/sea/<activity>`), in French and English. The words of the verdicts, of the activities
// and of the reasons are those of `activities.ts` (the same ones as on a spot's page); only what the sea pages add is here.
import type { Lang } from '../i18n';

const TEXT = {
	fr: {
		page: 'Mer',
		title: 'Aller à l’eau ?',
		intro:
			'Un verdict par activité et par spot, d’après des règles écrites par Vigie : elles ne connaissent ni la plage, ni le fond, ni la personne qui y va. Pas pour la sécurité : regardez la mer, les drapeaux et les sauveteurs avant d’y aller.',
		myActivity: 'Mon activité',
		'meta.surf':
			'Surf : les spots de la côte atlantique et de la Manche où aller aujourd’hui, avec la raison de chaque verdict. Règles de Vigie, pas pour la sécurité.',
		'meta.kite':
			'Kite, wing, windsurf : les spots où le vent est dans votre plage aujourd’hui, avec la raison de chaque verdict. Règles de Vigie, pas pour la sécurité.',
		'meta.boat':
			'Bateau : où le vent et la mer permettent de sortir aujourd’hui, avec la raison de chaque verdict. Règles de Vigie, pas pour la sécurité ni la navigation.',
		'meta.shore_fishing':
			'Pêche à pied : les spots où la basse mer et le coefficient estimé le permettent aujourd’hui, avec la raison de chaque verdict. Règles de Vigie, pas pour la sécurité.',
		'answer.none': 'Aucun spot ne peut être jugé pour cette activité pour le moment.',
		'answer.good.one': 'Bon à {name}{km}{slot}.',
		'answer.good.many': 'Bon à {name}{km}{slot}, et {others} autres spots à moins de {radius} km.',
		'answer.goodAll.many': 'Bon sur {count} spots, dont {name}{slot}.',
		'answer.possible.one': 'Rien de bon, mais possible à {name}{km}{slot}.',
		'answer.possible.many':
			'Rien de bon, mais possible à {name}{km}{slot}, et {others} autres spots à moins de {radius} km.',
		'answer.possibleAll.many': 'Rien de bon, mais possible sur {count} spots, dont {name}{slot}.',
		'answer.poor': 'Pas aujourd’hui : même le meilleur spot, {name}{km}, est déconseillé.',
		'answer.poorWhy': 'Pas aujourd’hui : même le meilleur spot, {name}{km}, est déconseillé. {why}.',
		'answer.unknown': 'Pas de verdict pour le moment : il manque une donnée (le vent, le plus souvent).',
		'answer.far': 'Aucun spot à moins de {radius} km. Le plus proche, {name}, est à {km} km : {verdict}.',
		'answer.slot': ', créneau {slot}',
		'answer.km': ' ({km} km)',
		place: 'Autour de {place}',
		myPosition: 'ma position',
		nobody: 'Pas de lieu choisi : tous les spots, du meilleur verdict au moins bon.',
		locate: 'Autour de ma position',
		locating: 'Recherche de la position…',
		locateFailed: 'La position n’a pas pu être lue : elle n’est demandée que sur un clic.',
		locateNote:
			'La position reste dans votre navigateur ; elle n’est envoyée à personne. Un lieu suivi dans « Autour de moi » est repris tout seul.',
		stopLocate: 'Tous les spots',
		spots: 'Les spots',
		spotsFar: 'Plus loin ({count} spots)',
		away: 'à {km} km',
		now: 'Maintenant',
		unavailable: 'Les verdicts ne répondent pas pour le moment.',
		unavailableHint: 'Réessayez dans quelques minutes ; aucun verdict n’est inventé.',
		stale: 'Un fournisseur n’a pas répondu : ce sont ses dernières données qui sont utilisées.',
		warnRed: 'Vigilance côtière rouge',
		warnOrange: 'Vigilance côtière orange',
		warnUnknown: 'Vigilances non lues',
		warnUnknownTitle:
			'Les vigilances côtières n’ont pas pu être lues pour ce spot : aucun verdict n’est plafonné, et leur absence ne veut pas dire qu’il n’y en a pas.',
		map: 'Voir la carte',
		mapNote: 'Chaque point est un spot, de la couleur de son verdict pour cette activité.',
		settings: 'Réglages',
		settingsNote: 'Gardés dans ce navigateur seulement ; rien n’est envoyé.',
		placeTitle: 'Aller à l’eau ici ?',
		placeAll: 'Les autres spots pour cette activité',
		unit: 'Unité du vent',
		windRange: 'Plage de vent du kite',
		windFrom: 'de',
		windTo: 'à',
		windApply: 'Appliquer',
		windReset: 'Remettre la plage par défaut',
		windHelp: 'Entre {min} et {max} {unit} ; le verdict du kite en tient compte.',
		windCurrent: 'Plage de vent du kite : {range}.',
		windDenied:
			'La plage demandée n’a pas pu être appliquée aujourd’hui : les verdicts sont ceux de la plage par défaut.',
		windBad: 'Une plage commence au-dessus de 0 et finit au-dessus de son début, à {max} {unit} au plus.',
		surfPage: 'La prévision de surf, note par note',
		placesPage: 'Les lieux du littoral : ports, cales, mouillages, plongée, baignade',
		updated: 'Verdicts calculés {time}.',
		legend: 'Vert ✓ bon · jaune ~ possible · rouge ✕ déconseillé · tireté ? pas de verdict'
	},
	en: {
		page: 'Sea',
		title: 'Should you go?',
		intro:
			'One verdict per activity and per spot, from rules written by Vigie: they know neither the beach, the bottom nor the person who goes. Not for safety: look at the sea, the flags and the lifeguards before going in.',
		myActivity: 'My activity',
		'meta.surf':
			'Surf: the spots of the Atlantic and Channel coasts to go to today, with the reason for each verdict. Rules of Vigie, not for safety.',
		'meta.kite':
			'Kite, wing, windsurf: the spots where the wind is in your range today, with the reason for each verdict. Rules of Vigie, not for safety.',
		'meta.boat':
			'Boat: where the wind and the sea let you go out today, with the reason for each verdict. Rules of Vigie, not for safety nor navigation.',
		'meta.shore_fishing':
			'Shore fishing: the spots where the low water and the estimated coefficient allow it today, with the reason for each verdict. Rules of Vigie, not for safety.',
		'answer.none': 'No spot can be judged for this activity at the moment.',
		'answer.good.one': 'Good at {name}{km}{slot}.',
		'answer.good.many': 'Good at {name}{km}{slot}, and {others} other spots within {radius} km.',
		'answer.goodAll.many': 'Good at {count} spots, including {name}{slot}.',
		'answer.possible.one': 'Nothing good, but possible at {name}{km}{slot}.',
		'answer.possible.many':
			'Nothing good, but possible at {name}{km}{slot}, and {others} other spots within {radius} km.',
		'answer.possibleAll.many': 'Nothing good, but possible at {count} spots, including {name}{slot}.',
		'answer.poor': 'Not today: even the best spot, {name}{km}, is poor.',
		'answer.poorWhy': 'Not today: even the best spot, {name}{km}, is poor. {why}.',
		'answer.unknown': 'No verdict at the moment: some data is missing (the wind, most often).',
		'answer.far': 'No spot within {radius} km. The nearest one, {name}, is {km} km away: {verdict}.',
		'answer.slot': ', slot {slot}',
		'answer.km': ' ({km} km)',
		place: 'Around {place}',
		myPosition: 'my position',
		nobody: 'No place chosen: all the spots, from the best verdict to the worst.',
		locate: 'Around my position',
		locating: 'Finding the position…',
		locateFailed: 'The position could not be read: it is only asked for on a click.',
		locateNote:
			'The position stays in your browser; it is sent to nobody. A place followed in “Near me” is taken up by itself.',
		stopLocate: 'All the spots',
		spots: 'The spots',
		spotsFar: 'Farther ({count} spots)',
		away: '{km} km away',
		now: 'Now',
		unavailable: 'The verdicts are not answering at the moment.',
		unavailableHint: 'Try again in a few minutes; no verdict is made up.',
		stale: 'A provider did not answer: its last data are used.',
		warnRed: 'Red coastal warning',
		warnOrange: 'Orange coastal warning',
		warnUnknown: 'Warnings not read',
		warnUnknownTitle:
			'The coastal warnings could not be read for this spot: no verdict is capped, and no warning shown does not mean there is none.',
		map: 'Show the map',
		mapNote: 'Each point is a spot, in the colour of its verdict for this activity.',
		settings: 'Settings',
		settingsNote: 'Kept in this browser only; nothing is sent.',
		placeTitle: 'Go in the water here?',
		placeAll: 'The other spots for this activity',
		unit: 'Unit of the wind',
		windRange: 'Wind range of the kite',
		windFrom: 'from',
		windTo: 'to',
		windApply: 'Apply',
		windReset: 'Back to the default range',
		windHelp: 'Between {min} and {max} {unit}; the kite verdict follows it.',
		windCurrent: 'Wind range of the kite: {range}.',
		windDenied:
			'The range asked for could not be applied today: the verdicts are those of the default range.',
		windBad: 'A range starts above 0 and ends above its start, at {max} {unit} at most.',
		surfPage: 'The surf forecast, rating by rating',
		placesPage: 'The places of the coast: ports, slipways, anchorages, diving, bathing',
		updated: 'Verdicts worked out {time}.',
		legend: 'Green ✓ good · yellow ~ possible · red ✕ poor · dashed ? no verdict'
	}
} as const;

export type SeaKey = keyof (typeof TEXT)['fr'];
/** The texts of the sea pages, so that a test can check that both languages have every one. */
export const SEA_TEXT = TEXT;

export function seaText(
	lang: Lang,
	key: SeaKey | string,
	vars: Record<string, string | number> = {}
): string {
	const table = TEXT[lang] as Record<string, string>;
	let text = table[key] ?? (TEXT.fr as Record<string, string>)[key] ?? key;
	for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
	return text;
}

/**
 * Sentences of the API that come in English, the same in every answer: the limits and the disclaimer of the overview
 * (`ACTIVITIES_LIMITS`, `ACTIVITIES_DISCLAIMER` of vigie-api, `app/models/activities.py`), the limits of a spot's surf forecast
 * (`SURF_LIMITS`, `app/models/surf.py`) and the note of an activity that cannot be judged for lack of a tide (`_NO_TIDE_NOTE`,
 * `app/services/activities.py`). A French page says them in French, but only when the API's sentence is exactly the one the French
 * was written for: if the API rewords it, the page shows the API's sentence as it comes, in English and marked as such, rather than
 * a French one that no longer says the same. A test holds the English side to the recorded answers of the API (all but the tide
 * note, which no recording has).
 */
export const API_SENTENCES: readonly { en: string; fr: string }[] = [
	{
		en:
			'The verdicts are rules of Vigie, written in `rules`: a few thresholds on the swell, the wind, the tide and the official coastal warnings. ' +
			'They do not know the beach, the bottom, the shelter of a bay or the person who goes: a beginner and an expert do not have the same limits ' +
			"(the wind range of the kite is the one asked for). The swell is Météo-France's MFWAM model on a grid of about 8 km; the wind is a forecast " +
			'at 10 m; the tide is computed from a global model and can be an hour late or more inside a bay. Hours are whole hours.',
		fr:
			'Les verdicts sont des règles de Vigie, écrites en clair dans l’API (champ « rules ») :quelques seuils sur la houle, le vent, la marée et les ' +
			'vigilances officielles du littoral. Elles ne connaissent ni la plage, ni le fond, ni l’abri d’une baie, ni la personne qui y va : un ' +
			'débutant et un expert n’ont pas les mêmes limites (la plage de vent du kite est celle qui a été demandée). La houle est celle du modèle ' +
			'MFWAM de Météo-France, sur une grille d’environ 8 km ; le vent est une prévision à 10 m ; la marée est calculée à partir d’un modèle ' +
			'global et peut avoir une heure de retard ou plus dans une baie. Les heures sont des heures pleines.'
	},
	{
		en:
			'Not for safety and not for navigation: look at the sea on the spot, the flags and the lifeguards, read the tide tables and the official ' +
			'warnings, and follow the instructions of the authorities.',
		fr:
			'Pas pour la sécurité ni pour la navigation : regardez la mer sur place, les drapeaux et les sauveteurs, lisez les annuaires de marées et ' +
			'les vigilances officielles, et suivez les consignes des autorités.'
	},
	{
		en:
			"The swell is Météo-France's MFWAM wave model on its grid of about 8 km, computed every 3 hours (Open-Meteo gives it every hour): it does not see the sandbanks, the reefs, the jetties or the shelter of a beach, and the waves on the beach can be much smaller or larger. " +
			'The wind is a forecast at 10 m. The tide is computed from a global model and can be an hour late or more inside a bay. The facing of a spot is worked out from the OpenStreetMap coastline. ' +
			"The rating is Vigie's own rule: a few thresholds, given in `rules`; it knows neither the spot nor the surfer.",
		fr:
			'La houle est celle du modèle de vagues MFWAM de Météo-France, sur sa grille d’environ 8 km, calculée toutes les 3 heures (Open-Meteo la donne toutes les heures) : il ne voit ni les bancs de sable, ni les récifs, ni les jetées, ni l’abri d’une plage, et les vagues sur la plage peuvent être beaucoup plus petites ou plus grandes. ' +
			'Le vent est une prévision à 10 m. La marée est calculée à partir d’un modèle global et peut avoir une heure de retard ou plus dans une baie. L’orientation d’un spot est calculée d’après le trait de côte d’OpenStreetMap. ' +
			'La note est une règle propre à Vigie : quelques seuils, donnés dans le champ « rules » ; elle ne connaît ni le spot ni le surfeur.'
	},
	{
		en: 'No tide model near this spot, or none for these dates: shore fishing cannot be judged here.',
		fr: 'Pas de modèle de marée près de ce spot, ou aucun pour ces dates : la pêche à pied ne peut pas être jugée ici.'
	}
];

/** A sentence of the API in the language of the page when we know it, else as the API gives it (English): the words and their language. */
export function apiSentence(lang: Lang, text: string): { text: string; lang: Lang } {
	if (lang === 'fr') {
		const known = API_SENTENCES.find((s) => s.en === text.trim());
		if (known) return { text: known.fr, lang: 'fr' };
	}
	return { text, lang: 'en' };
}
