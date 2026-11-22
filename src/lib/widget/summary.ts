// What the widget page tells the desktop app that shows it: a few words and figures, for the icon near the clock and for its
// notifications, worked out by the same functions as the page (the app never matches a place against the warnings itself). The
// app gets them as a message of its WebView2 (`window.chrome.webview`); an ordinary browser has no such host and gets nothing.
import { activityText } from '../activities';
import { tOr, type Lang } from '../i18n';
import { warningLabel } from '../sentence';
import type { TvScreen } from '../tv/model';
import type { OfficialState } from '../sentence';
import type { Level, WarningSummary } from '../types';
import { featured, phenomenonLabel, type RainView, type VigilanceView } from './model';

/** The name of a phenomenon, for the page and for the app: the site's word, else the issuer's without its level. */
export const labelOf =
	(lang: Lang) =>
	(w: WarningSummary): string | null =>
		phenomenonLabel(
			w,
			(p) => tOr(lang, `phen.${p}`, '') || null,
			(y) => warningLabel(y, lang)
		);

export interface WidgetSummary {
	type: 'vigie-summary';
	version: 1;
	/** False while the warnings or the weather of the place are still loading. */
	ready: boolean;
	name: string | null;
	vigilance: { state: OfficialState; level: Level | null; labels: string[]; until: number | null } | null;
	rain: {
		status: RainView['status'];
		inMin: number | null;
		forMin: number | null;
		maxMmH: number | null;
	} | null;
	tempC: number | null;
	spot: { name: string; activity: string | null; verdict: string | null; slot: string | null } | null;
	/** Epoch seconds the summary was made. */
	at: number;
}

export function widgetSummary(input: {
	lang: Lang;
	now: number;
	name: string | null;
	vigilance: VigilanceView | null;
	rain: RainView | null;
	weatherLoading: boolean;
	tempC: number | null;
	spot: TvScreen | null;
}): WidgetSummary {
	const { lang, vigilance, rain, spot } = input;
	const best = spot ? featured(spot.activities) : null;
	return {
		type: 'vigie-summary',
		version: 1,
		ready: (vigilance == null || vigilance.state !== 'loading') && !input.weatherLoading,
		name: input.name,
		vigilance: vigilance && {
			state: vigilance.state,
			level: vigilance.level,
			labels: vigilance.labels,
			until: vigilance.until
		},
		rain: rain && { status: rain.status, inMin: rain.inMin, forMin: rain.forMin, maxMmH: rain.maxMmH },
		tempC: input.tempC,
		spot: spot && {
			name: spot.spot.name,
			activity: best ? activityText(lang, `activity.${best.id}`) : null,
			verdict: best?.verdict ? activityText(lang, `verdict.${best.verdict}`) : null,
			slot: best?.slot ?? null
		},
		at: input.now
	};
}

type Host = { chrome?: { webview?: { postMessage(message: unknown): void } } };

/** Send the summary to the app that hosts the page, when there is one. */
export function postToHost(summary: WidgetSummary): void {
	(globalThis as Host).chrome?.webview?.postMessage(summary);
}
