// One list for hazards and warnings: what the rows of the alert list need.
import { tOr, type Lang } from './i18n';
import { pickText } from './transform';
import type { Hazard, Level, WarningSummary } from './types';

export type Row =
	| {
			kind: 'hazard';
			key: string;
			category: string;
			level: Level | null;
			time: number | null;
			hazard: Hazard;
	  }
	| {
			kind: 'warning';
			key: string;
			category: 'VIGILANCE';
			level: Level | null;
			time: number | null;
			warning: WarningSummary;
	  };

export function hazardRow(hazard: Hazard): Row {
	return {
		kind: 'hazard',
		key: `h:${hazard.id}`,
		category: hazard.category,
		level: hazard.level,
		time: hazard.time,
		hazard
	};
}

export function warningRow(warning: WarningSummary): Row {
	return {
		kind: 'warning',
		key: `w:${warning.cc}:${warning.id}`,
		category: 'VIGILANCE',
		level: warning.level,
		time: warning.onset ?? warning.sent,
		warning
	};
}

/** The issuer's headline in the reader's language when given, else the site's own phenomenon label. */
export function warningTitle(warning: WarningSummary, lang: Lang): string {
	const text = pickText(warning.texts, lang);
	return (
		text?.headline ??
		text?.event ??
		(warning.phenomenon ? tOr(lang, `phen.${warning.phenomenon}`, warning.phenomenon) : '–')
	);
}

export function warningHref(warning: Pick<WarningSummary, 'cc' | 'id'>): string {
	return `/warning/${warning.cc.toLowerCase()}/${encodeURIComponent(warning.id)}`;
}

export function hazardHref(hazard: Pick<Hazard, 'id'>): string {
	return `/alert/${encodeURIComponent(hazard.id)}`;
}
