import { describe, expect, it } from 'vitest';
import { answerText } from './answer';
import { NEAR_KM, type Answer } from './overview';

const slot = { start: 1_794_132_000, end: 1_794_139_200 };

describe('the first sentence of a sea page', () => {
	it('says where it is good, how far, when, and how many more', () => {
		const good: Answer = { kind: 'good', count: 3, name: 'Hossegor', km: 12.4, slot };
		const fr = answerText('fr', good, true);
		expect(fr).toContain('Bon à Hossegor (12 km)');
		expect(fr).toContain('créneau');
		expect(fr).toContain(`2 autres spots à moins de ${NEAR_KM} km`);
		expect(answerText('en', good, true)).toContain('Good at Hossegor (12 km)');
		expect(answerText('fr', { ...good, count: 1, slot: null }, true)).toBe('Bon à Hossegor (12 km).');
	});

	it('does not claim a distance it does not have, and counts all the spots without a place', () => {
		const text = answerText('fr', { kind: 'good', count: 4, name: 'Hossegor', km: null, slot: null }, false);
		expect(text).toBe('Bon sur 4 spots, dont Hossegor.');
		expect(
			answerText('en', { kind: 'possible', count: 1, name: 'Hossegor', km: null, slot: null }, false)
		).toBe('Nothing good, but possible at Hossegor.');
	});

	it('says the best spot is poor, with the reason when it is known and understood', () => {
		const poor: Answer = { kind: 'poor', name: 'Biarritz', km: 5, reason: 'swell_height.too_small' };
		expect(answerText('fr', poor, true)).toBe(
			'Pas aujourd’hui : même le meilleur spot, Biarritz (5 km), est déconseillé. Hauteur de la houle : trop petite.'
		);
		expect(answerText('fr', { ...poor, reason: 'some.new_code' }, true)).toBe(
			'Pas aujourd’hui : même le meilleur spot, Biarritz (5 km), est déconseillé.'
		);
	});

	it('says when no spot is near, when nothing is known, and when nothing can be judged', () => {
		expect(answerText('fr', { kind: 'far', name: 'Hossegor', km: 480, verdict: 'possible' }, true)).toBe(
			`Aucun spot à moins de ${NEAR_KM} km. Le plus proche, Hossegor, est à 480 km : possible.`
		);
		expect(answerText('en', { kind: 'far', name: 'Hossegor', km: 480, verdict: null }, true)).toContain(
			'no verdict'
		);
		expect(answerText('fr', { kind: 'unknown', total: 3 }, true)).toContain('Pas de verdict');
		expect(answerText('fr', { kind: 'none' }, false)).toContain('Aucun spot');
	});
});
