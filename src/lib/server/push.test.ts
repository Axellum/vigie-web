import { describe, expect, it, vi } from 'vitest';

const env: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env }));

const { isPushEndpoint, parseSubscription } = await import('./push');
const { inQuietHours } = await import('./notify');

const KEYS = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };

describe('isPushEndpoint', () => {
	it('accepts the push services of the browsers, over https', () => {
		expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
		expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
		expect(isPushEndpoint('https://web.push.apple.com/QGx')).toBe(true);
		expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
	});

	it('refuses any other address, a port, plain http and look-alikes', () => {
		expect(isPushEndpoint('https://example.com/push')).toBe(false);
		expect(isPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
		expect(isPushEndpoint('https://fcm.googleapis.com:8443/fcm/send/abc')).toBe(false);
		expect(isPushEndpoint('https://fcm.googleapis.com.example.com/x')).toBe(false);
		expect(isPushEndpoint('https://evilpush.apple.com.example/x')).toBe(false);
		expect(isPushEndpoint('https://127.0.0.1/x')).toBe(false);
		expect(isPushEndpoint('not a url')).toBe(false);
		expect(isPushEndpoint(42)).toBe(false);
		expect(isPushEndpoint(`https://fcm.googleapis.com/${'x'.repeat(2000)}`)).toBe(false);
	});

	it('accepts the extra hosts set for tests, and only them', () => {
		env.VIGIE_PUSH_EXTRA_HOSTS = '127.0.0.1:18282';
		try {
			expect(isPushEndpoint('http://127.0.0.1:18282/push/1')).toBe(true);
			expect(isPushEndpoint('http://127.0.0.1:18283/push/1')).toBe(false);
		} finally {
			delete env.VIGIE_PUSH_EXTRA_HOSTS;
		}
	});
});

describe('parseSubscription', () => {
	it('keeps what a browser gives', () => {
		const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', expirationTime: null, keys: KEYS };
		expect(parseSubscription(sub)).toEqual({ endpoint: sub.endpoint, keys: KEYS });
	});

	it('refuses a subscription without keys, with odd keys or to an unknown host', () => {
		expect(parseSubscription(null)).toBeNull();
		expect(parseSubscription({ endpoint: 'https://fcm.googleapis.com/x' })).toBeNull();
		expect(
			parseSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys: { ...KEYS, auth: 'a b' } })
		).toBeNull();
		expect(parseSubscription({ endpoint: 'https://example.com/x', keys: KEYS })).toBeNull();
	});
});

describe('inQuietHours', () => {
	it('is quiet from 22:00 to 07:00 in the person’s time zone', () => {
		// 21:30 UTC = 23:30 in Paris (summer time), 08:30 in Sydney.
		const evening = new Date('2026-07-01T21:30:00Z');
		expect(inQuietHours('Europe/Paris', evening)).toBe(true);
		expect(inQuietHours('Australia/Sydney', evening)).toBe(false);
		expect(inQuietHours('Europe/Paris', new Date('2026-07-01T05:30:00Z'))).toBe(false); // 07:30
		expect(inQuietHours('Europe/Paris', new Date('2026-07-01T04:59:00Z'))).toBe(true); // 06:59
		expect(inQuietHours('Europe/Paris', new Date('2026-07-01T19:59:00Z'))).toBe(false); // 21:59
	});

	it('uses Paris when the time zone is unknown or wrong', () => {
		const night = new Date('2026-01-15T23:00:00Z'); // midnight in Paris
		expect(inQuietHours(null, night)).toBe(true);
		expect(inQuietHours('Not/AZone', night)).toBe(true);
		expect(inQuietHours('Not/AZone', new Date('2026-01-15T11:00:00Z'))).toBe(false);
	});
});
