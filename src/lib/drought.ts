// French VigiEau drought restrictions (`GET /v1/point.drought` and `GET /v1/drought`).
// Only defined for French metropolitan and DROM territories (`FR`, `GP`, `MQ`, `GF`, `RE`, `YT`);
// outside coverage or when `outside_coverage` is returned, nothing is fabricated or displayed.
import type { Lang } from './i18n';
import type { Level } from './types';

export type DroughtLevel = 'vigilance' | 'alerte' | 'alerte_renforcee' | 'crise';
export type DroughtWaterType = 'AEP' | 'SUP' | 'SOU';
export type DroughtPointStatusKind = 'available' | 'confirmed_none' | 'unavailable';
export type DroughtResponseStatusKind =
	DroughtPointStatusKind | 'outside_coverage' | 'ambiguous_commune' | 'invalid_query';

export const DROUGHT_COUNTRIES = new Set(['FR', 'GP', 'MQ', 'GF', 'RE', 'YT']);

const LEVELS = new Set<DroughtLevel>(['vigilance', 'alerte', 'alerte_renforcee', 'crise']);
const WATER_TYPES = new Set<DroughtWaterType>(['AEP', 'SUP', 'SOU']);
const POINT_STATUSES = new Set<DroughtPointStatusKind>(['available', 'confirmed_none', 'unavailable']);
const RESPONSE_STATUSES = new Set<DroughtResponseStatusKind>([
	'available',
	'confirmed_none',
	'unavailable',
	'outside_coverage',
	'ambiguous_commune',
	'invalid_query'
]);

export interface DroughtAvailability {
	status: string;
	asOf: string | null;
	sourceRevision: string | null;
	officialUrl: string | null;
	freshness: string | null;
	pendingSince: string | null;
}

export interface DroughtZoneSummary {
	id: number;
	name: string;
	waterType: DroughtWaterType;
	level: DroughtLevel | null;
	influencedResource: boolean | null;
	decreeValidUntil: string | null;
}

export interface DroughtStatus {
	status: DroughtPointStatusKind;
	maxLevel: DroughtLevel | null;
	restrictionsInForce: boolean | null;
	department: string | null;
	zones: DroughtZoneSummary[];
	availability: Record<string, DroughtAvailability>;
	asOf: string | null;
	attribution: string | null;
}

export interface DroughtDecree {
	id: number | null;
	pdfUrl: string | null;
	frameworkPdfUrl: string | null;
	validFrom: string | null;
	validUntil: string | null;
}

export interface DroughtUsageRestriction {
	id: number | null;
	name: string;
	theme: string;
	description: string | null;
	concernsIndividual: boolean | null;
	concernsBusiness: boolean | null;
	concernsMunicipality: boolean | null;
	concernsFarm: boolean | null;
}

export interface DroughtZone {
	id: number;
	name: string;
	code: string | null;
	waterType: DroughtWaterType;
	department: string | null;
	level: DroughtLevel | null;
	influencedResource: boolean | null;
	sandreId: number | null;
	decree: DroughtDecree | null;
	municipalDecreeUrl: string | null;
	usages: DroughtUsageRestriction[];
}

export interface DroughtResponse {
	status: DroughtResponseStatusKind;
	note: string | null;
	ambiguousWaterTypes: DroughtWaterType[];
	maxLevel: DroughtLevel | null;
	restrictionsInForce: boolean | null;
	department: string | null;
	zones: DroughtZone[];
	availability: Record<string, DroughtAvailability>;
	asOf: string | null;
	stale: boolean;
	attribution: string | null;
}

const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

const levelOf = (v: unknown): DroughtLevel | null => {
	const s = str(v);
	return s && LEVELS.has(s as DroughtLevel) ? (s as DroughtLevel) : null;
};

const waterTypeOf = (v: unknown): DroughtWaterType | null => {
	const s = str(v);
	return s && WATER_TYPES.has(s as DroughtWaterType) ? (s as DroughtWaterType) : null;
};

function availabilityFromApi(raw: unknown): Record<string, DroughtAvailability> {
	const out: Record<string, DroughtAvailability> = {};
	for (const [k, v] of Object.entries(obj(raw))) {
		const a = obj(v);
		const status = str(a.status);
		if (!status) continue;
		out[k] = {
			status,
			asOf: str(a.as_of),
			sourceRevision: str(a.source_revision),
			officialUrl: str(a.official_url),
			freshness: str(a.freshness),
			pendingSince: str(a.pending_since)
		};
	}
	return out;
}

/** Parse compact drought status embedded in `GET /v1/point`. Null outside FR/DROM coverage or when absent. */
export function droughtStatusFromApi(raw: unknown): DroughtStatus | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = obj(raw);
	const status = str(r.status);
	if (!status || !POINT_STATUSES.has(status as DroughtPointStatusKind)) return null;
	const zones = (Array.isArray(r.zones) ? r.zones : []).flatMap((item): DroughtZoneSummary[] => {
		const z = obj(item);
		const id = num(z.id);
		const name = str(z.name);
		const waterType = waterTypeOf(z.water_type);
		if (id == null || !name || !waterType) return [];
		return [
			{
				id,
				name,
				waterType,
				level: levelOf(z.level),
				influencedResource: bool(z.influenced_resource),
				decreeValidUntil: str(z.decree_valid_until)
			}
		];
	});
	return {
		status: status as DroughtPointStatusKind,
		maxLevel: levelOf(r.max_level),
		restrictionsInForce: bool(r.restrictions_in_force),
		department: str(r.department),
		zones,
		availability: availabilityFromApi(r.availability),
		asOf: str(r.as_of),
		attribution: str(r.attribution)
	};
}

/** Parse full response of `GET /v1/drought`. Returns null only for malformed payloads. */
export function droughtFromApi(raw: unknown): DroughtResponse | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = obj(raw);
	const status = str(r.status);
	if (!status || !RESPONSE_STATUSES.has(status as DroughtResponseStatusKind)) return null;
	const zones = (Array.isArray(r.zones) ? r.zones : []).flatMap((item): DroughtZone[] => {
		const z = obj(item);
		const id = num(z.id);
		const name = str(z.name);
		const waterType = waterTypeOf(z.water_type);
		if (id == null || !name || !waterType) return [];
		const dec = z.decree && typeof z.decree === 'object' ? obj(z.decree) : null;
		const usages = (Array.isArray(z.usages) ? z.usages : []).flatMap((uItem): DroughtUsageRestriction[] => {
			const u = obj(uItem);
			const uName = str(u.name);
			const uTheme = str(u.theme);
			if (!uName || !uTheme) return [];
			return [
				{
					id: num(u.id),
					name: uName,
					theme: uTheme,
					description: str(u.description),
					concernsIndividual: bool(u.concerns_individual),
					concernsBusiness: bool(u.concerns_business),
					concernsMunicipality: bool(u.concerns_municipality),
					concernsFarm: bool(u.concerns_farm)
				}
			];
		});
		return [
			{
				id,
				name,
				code: str(z.code),
				waterType,
				department: str(z.department),
				level: levelOf(z.level),
				influencedResource: bool(z.influenced_resource),
				sandreId: num(z.sandre_id),
				decree: dec
					? {
							id: num(dec.id),
							pdfUrl: str(dec.pdf_url),
							frameworkPdfUrl: str(dec.framework_pdf_url),
							validFrom: str(dec.valid_from),
							validUntil: str(dec.valid_until)
						}
					: null,
				municipalDecreeUrl: str(z.municipal_decree_url),
				usages
			}
		];
	});
	const ambiguousWaterTypes = (Array.isArray(r.ambiguous_water_types) ? r.ambiguous_water_types : [])
		.map(waterTypeOf)
		.filter((wt): wt is DroughtWaterType => wt != null);
	return {
		status: status as DroughtResponseStatusKind,
		note: str(r.note),
		ambiguousWaterTypes,
		maxLevel: levelOf(r.max_level),
		restrictionsInForce: bool(r.restrictions_in_force),
		department: str(r.department),
		zones,
		availability: availabilityFromApi(r.availability),
		asOf: str(r.as_of),
		stale: r.stale === true,
		attribution: str(r.attribution)
	};
}

/** Map VigiEau native drought level to Vigie badge colours without inventing an official Vigie warning level. */
export function droughtSeverityTone(level: DroughtLevel | null): Level | null {
	switch (level) {
		case 'vigilance':
			return 'YELLOW';
		case 'alerte':
		case 'alerte_renforcee':
			return 'ORANGE';
		case 'crise':
			return 'RED';
		default:
			return null;
	}
}

export function isCoveredDroughtCountry(cc: string | null | undefined): boolean {
	return !!cc && DROUGHT_COUNTRIES.has(cc.toUpperCase());
}

const TEXT = {
	fr: {
		title: 'Sécheresse (VigiEau)',
		'level.vigilance': 'Vigilance',
		'level.alerte': 'Alerte',
		'level.alerte_renforcee': 'Alerte renforcée',
		'level.crise': 'Crise',
		'water.AEP': 'Eau potable',
		'water.SUP': 'Eaux superficielles (rivières, plans d’eau)',
		'water.SOU': 'Eaux souterraines (nappes)',
		'waterShort.AEP': 'Eau potable (AEP)',
		'waterShort.SUP': 'Eaux superficielles (SUP)',
		'waterShort.SOU': 'Eaux souterraines (SOU)',
		summaryActive: 'Sécheresse (VigiEau) : {level}',
		summaryVigilance: 'Sécheresse (VigiEau) : vigilance (pas de restriction obligatoire)',
		summaryNone: 'Sécheresse (VigiEau) : aucune restriction en cours',
		summaryUnavailable: 'Sécheresse (VigiEau) : données partiellement indisponibles',
		restrictionsYes: 'Des restrictions d’usage de l’eau sont en vigueur (niveau {level}).',
		restrictionsVigilance:
			'Niveau de vigilance : sensibilisation aux économies d’eau, sans restriction obligatoire à ce stade.',
		noneInForce: 'Aucune zone de restriction sécheresse active signalée par VigiEau ici.',
		unavailableNote:
			'La disponibilité VigiEau est incomplète : l’absence affichée ne garantit pas l’absence de restriction.',
		stale: 'Données VigiEau plus anciennes que d’habitude : le service n’a pas répondu.',
		ambiguousNote:
			'Ressource ou secteur partagé pour : {types}. Plusieurs arrêtés ou zones peuvent s’appliquer selon l’origine exacte de votre eau : vérifiez à l’adresse précise sur VigiEau.',
		ambiguousCommune:
			'Cette commune recoupe plusieurs zones VigiEau pour {types} : précisez la position ou vérifiez votre adresse sur VigiEau.',
		influencedResource: 'Ressource réalimentée (retenue ou lâcher en amont)',
		decreePdf: 'Arrêté préfectoral (PDF)',
		frameworkPdf: 'Arrêté-cadre (PDF)',
		municipalDecree: 'Arrêté communal',
		validUntil: 'Valable jusqu’au {date}',
		usages: 'Mesures applicables ({n})',
		'who.individual': 'Particuliers',
		'who.business': 'Entreprises',
		'who.municipality': 'Collectivités',
		'who.farm': 'Exploitations agricoles',
		partialUnavailable: 'Indisponible pour : {types}.',
		officialCheck: 'Consulter les mesures complètes à l’adresse sur VigiEau (beta.gouv.fr)'
	},
	en: {
		title: 'Drought restrictions (VigiEau)',
		'level.vigilance': 'Watch (vigilance)',
		'level.alerte': 'Alert',
		'level.alerte_renforcee': 'Reinforced alert',
		'level.crise': 'Crisis',
		'water.AEP': 'Drinking water',
		'water.SUP': 'Surface water (rivers, lakes)',
		'water.SOU': 'Groundwater (aquifers)',
		'waterShort.AEP': 'Drinking water (AEP)',
		'waterShort.SUP': 'Surface water (SUP)',
		'waterShort.SOU': 'Groundwater (SOU)',
		summaryActive: 'Drought (VigiEau): {level}',
		summaryVigilance: 'Drought (VigiEau): watch (no mandatory restriction)',
		summaryNone: 'Drought (VigiEau): no active restriction',
		summaryUnavailable: 'Drought (VigiEau): data partially unavailable',
		restrictionsYes: 'Water-use restrictions are in force (level: {level}).',
		restrictionsVigilance:
			'Watch level: water-saving awareness only, no mandatory restriction at this stage.',
		noneInForce: 'No active drought restriction zone reported by VigiEau here.',
		unavailableNote:
			'VigiEau availability is incomplete: no restriction shown here does not guarantee none applies.',
		stale: 'Older VigiEau data than usual: the service did not answer.',
		ambiguousNote:
			'Multiple or overlapping zones apply for: {types}. Restrictions depend on your exact water origin or sector: check your exact street address on VigiEau.',
		ambiguousCommune:
			'This commune spans several VigiEau zones for {types}: use coordinates or check your exact street address on VigiEau.',
		influencedResource: 'Regulated resource (upstream reservoir release)',
		decreePdf: 'Prefectural decree (PDF)',
		frameworkPdf: 'Framework decree (PDF)',
		municipalDecree: 'Municipal decree',
		validUntil: 'Valid until {date}',
		usages: 'Applicable measures ({n})',
		'who.individual': 'Individuals',
		'who.business': 'Businesses',
		'who.municipality': 'Municipalities',
		'who.farm': 'Farms',
		partialUnavailable: 'Unavailable for: {types}.',
		officialCheck: 'Check exact address-level rules on VigiEau (beta.gouv.fr)'
	}
} as const;

export type DroughtTextKey = keyof (typeof TEXT)['fr'];

export function droughtText(
	lang: Lang,
	key: DroughtTextKey,
	vars: Record<string, string | number> = {}
): string {
	let out: string = TEXT[lang][key];
	for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
	return out;
}

export function droughtLevelLabel(lang: Lang, level: DroughtLevel): string {
	return droughtText(lang, `level.${level}` as DroughtTextKey);
}

export function waterTypeLabel(lang: Lang, waterType: DroughtWaterType): string {
	return droughtText(lang, `waterShort.${waterType}` as DroughtTextKey);
}
