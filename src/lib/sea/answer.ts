// The first sentence of a sea page, "can I go?", worked out from `answerOf` (data) in the reader's words. Every name, distance and
// time in it is the API's; a figure it did not give is left out of the sentence.
import { activityText, reasonText } from '../activities';
import { number } from '../format';
import type { Lang } from '../i18n';
import { hourLabel, slotLabel } from '../surf';
import { NEAR_KM, type Answer } from './overview';
import { seaText } from './text';

const kmText = (lang: Lang, km: number): string => number(lang, km, km < 10 ? 1 : 0);

export function answerText(lang: Lang, answer: Answer, hasPlace: boolean): string {
	const t = (key: string, vars: Record<string, string | number> = {}) => seaText(lang, key, vars);
	const km = (value: number | null) => (value == null ? '' : t('answer.km', { km: kmText(lang, value) }));
	switch (answer.kind) {
		case 'none':
			return t('answer.none');
		case 'unknown':
			return t('answer.unknown');
		case 'far':
			return t('answer.far', {
				radius: NEAR_KM,
				name: answer.name,
				km: kmText(lang, answer.km),
				verdict: answer.verdict
					? activityText(lang, `verdict.${answer.verdict}`).toLowerCase()
					: activityText(lang, 'unknown').toLowerCase()
			});
		case 'poor': {
			const why = reasonText(lang, answer.reason);
			return why
				? t('answer.poorWhy', { name: answer.name, km: km(answer.km), why })
				: t('answer.poor', { name: answer.name, km: km(answer.km) });
		}
		case 'good':
		case 'possible': {
			const slot = answer.slot
				? t('answer.slot', {
						slot: `${slotLabel(lang, answer.slot.start)} – ${hourLabel(lang, answer.slot.end)}`
					})
				: '';
			const base = { name: answer.name, km: km(answer.km), slot };
			const many = answer.count > 1;
			if (!many) return t(`answer.${answer.kind}.one`, base);
			return hasPlace
				? t(`answer.${answer.kind}.many`, { ...base, others: answer.count - 1, radius: NEAR_KM })
				: t(`answer.${answer.kind}All.many`, { ...base, count: answer.count });
		}
	}
}
