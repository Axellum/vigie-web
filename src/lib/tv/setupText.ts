// The words of the page that sets a television screen up (`/screens`), in French and English. Its own table, like the screen's: this
// page is about one thing and its words are not shared with the rest of the site.
import type { Lang } from '../i18n';

const TEXT = {
	fr: {
		title: 'Un écran de météo et de mer pour une télévision',
		description:
			"Choisissez un lieu de la côte et un style : Vigie compose l'adresse d'un écran de vent, de marée, de houle et de ciel à ouvrir sur la télévision d'un port, d'un club ou d'une boutique. Gratuit, sans compte.",
		intro:
			"Vigie peut montrer sur une télévision le vent, la marée, la houle, le ciel et un verdict par activité pour un lieu de la côte. L'écran se règle seulement par son adresse : rien n'est enregistré sur le site, il n'y a ni compte ni cookie. Il suffit d'ouvrir l'adresse dans le navigateur de la télévision.",
		formTitle: 'Régler l’écran',
		spot: 'Lieu',
		spotChoose: 'Choisir un lieu…',
		spotId: 'Identifiant du lieu',
		spotsDown:
			'La liste des lieux ne répond pas pour l’instant. Entrez l’identifiant d’un lieu de la page Surf.',
		preset: 'Pour qui',
		port: 'Capitainerie',
		portHelp: 'Le vent, la marée, la réponse pour le bateau et le ciel.',
		club: 'Club de sports nautiques',
		clubHelp: 'La houle, le vent et la marée.',
		shop: 'Boutique',
		shopHelp: 'Les verdicts des quatre activités, la marée, le ciel et un code QR vers la page complète.',
		panels: 'Ce qui défile',
		'panels.cadran,verdicts': 'Les instruments, puis les verdicts',
		'panels.verdicts,cadran': 'Les verdicts, puis les instruments',
		'panels.cadran': 'Les instruments seulement',
		'panels.verdicts': 'Les verdicts seulement',
		panelsHelp:
			'Les instruments donnent les chiffres du moment ; les verdicts donnent d’abord la réponse : peut-on y aller ?',
		seconds: 'Secondes par panneau',
		secondsHelp: 'De 5 à 300. Sans effet quand un seul panneau est montré.',
		theme: 'Jour et nuit',
		'theme.auto': 'Automatique',
		'theme.day': 'Toujours le jour',
		'theme.night': 'Toujours la nuit',
		themeHelp: 'Automatique : suit le lever et le coucher du soleil au lieu choisi.',
		lang: 'Langue de l’écran',
		langHelp:
			'Écrite dans l’adresse : le navigateur d’une télévision n’a pas forcément la langue de la boutique.',
		advanced: 'Réglages avancés',
		refresh: 'Relecture de la page (secondes)',
		refreshHelp:
			'De 60 à 3 600. L’écran relit la page seul ; les données sont gardées plusieurs minutes de toute façon.',
		reload: 'Rechargement complet (heures)',
		reloadHelp: 'De 1 à 48. Évite qu’un navigateur de télévision ne grossisse pendant des jours.',
		apply: 'Composer l’adresse',
		resultTitle: 'L’adresse de l’écran',
		resultEmpty: 'Choisissez un lieu pour voir l’adresse.',
		copy: 'Copier',
		copied: 'Copiée',
		open: 'Ouvrir l’écran dans un nouvel onglet',
		onTvTitle: 'Sur la télévision',
		onTv1:
			'Entrez l’adresse ci-dessus dans le navigateur de la télévision, puis gardez-la en favori. Elle ne garde que ce qui n’est pas réglé par défaut.',
		onTv2:
			'L’écran se met à jour seul et se recharge entièrement de temps en temps ; si le site ne répond plus, il le dit et garde les dernières valeurs.',
		onTv3:
			'Il vise les navigateurs de télévision vendues depuis 2018 environ. Il n’a pas encore été essayé sur une vraie télévision.',
		aboutTitle: 'Ce que montre l’écran',
		about1:
			'Les valeurs viennent de modèles de prévision pour le lieu choisi, pas de mesures sur place. L’écran ne remplace pas les avis officiels et le dit en bas.',
		about2:
			'Les crédits des sources sont toujours à l’écran. Détail et réglages : la documentation du projet.',
		docs: 'Documentation'
	},
	en: {
		title: 'A weather and sea screen for a television',
		description:
			'Pick a place on the coast and a style: Vigie composes the address of a screen of wind, tide, swell and sky to open on the television of a harbour, a club or a shop. Free, no account.',
		intro:
			'Vigie can show on a television the wind, the tide, the swell, the sky and a verdict per activity for a place on the coast. The screen is set by its address alone: nothing is saved on the site, there is no account and no cookie. Open the address in the television’s browser.',
		formTitle: 'Set the screen',
		spot: 'Place',
		spotChoose: 'Choose a place…',
		spotId: 'Id of the place',
		spotsDown: 'The list of places does not answer for now. Enter the id of a place of the Surf page.',
		preset: 'For whom',
		port: 'Harbour office',
		portHelp: 'The wind, the tide, the answer for the boat and the sky.',
		club: 'Water sports club',
		clubHelp: 'The swell, the wind and the tide.',
		shop: 'Shop',
		shopHelp: 'The verdicts of the four activities, the tide, the sky and a QR code to the full page.',
		panels: 'What takes turns',
		'panels.cadran,verdicts': 'The instruments, then the verdicts',
		'panels.verdicts,cadran': 'The verdicts, then the instruments',
		'panels.cadran': 'The instruments only',
		'panels.verdicts': 'The verdicts only',
		panelsHelp:
			'The instruments give the figures of the moment; the verdicts give the answer first: can I go?',
		seconds: 'Seconds per panel',
		secondsHelp: 'From 5 to 300. No effect when only one panel is shown.',
		theme: 'Day and night',
		'theme.auto': 'Automatic',
		'theme.day': 'Always day',
		'theme.night': 'Always night',
		themeHelp: 'Automatic: follows sunrise and sunset at the chosen place.',
		lang: 'Language of the screen',
		langHelp:
			'Written in the address: a television’s browser does not necessarily speak the language of the shop.',
		advanced: 'Advanced settings',
		refresh: 'Reading of the page (seconds)',
		refreshHelp:
			'From 60 to 3,600. The screen reads the page by itself; the data are kept several minutes anyway.',
		reload: 'Complete reload (hours)',
		reloadHelp: 'From 1 to 48. Stops a television’s browser from growing over days.',
		apply: 'Compose the address',
		resultTitle: 'The address of the screen',
		resultEmpty: 'Choose a place to see the address.',
		copy: 'Copy',
		copied: 'Copied',
		open: 'Open the screen in a new tab',
		onTvTitle: 'On the television',
		onTv1:
			'Enter the address above in the television’s browser, then keep it as a bookmark. It holds only what is not left at its default.',
		onTv2:
			'The screen updates by itself and reloads completely now and then; if the site stops answering, it says so and keeps the last values.',
		onTv3:
			'It targets the browsers of televisions sold since about 2018. It has not been tried on a real television yet.',
		aboutTitle: 'What the screen shows',
		about1:
			'The values come from forecast models for the chosen place, not from measures on the spot. The screen does not replace the official warnings and says so at the bottom.',
		about2:
			'The credits of the sources are always on the screen. Details and settings: the project documentation.',
		docs: 'Documentation'
	}
} as const;

export type SetupKey = keyof (typeof TEXT)['fr'];

export const SETUP_TEXT = TEXT;

export function setupText(lang: Lang, key: SetupKey): string {
	return TEXT[lang][key];
}
