// The browser's side of the notifications: subscribe this device with the site's service worker and tell the
// server (/account/push). The push service of the browser carries the messages, encrypted for this device.

export function pushSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window
	);
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
	if (!pushSupported()) return null;
	return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** This device's subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
	const reg = await registration();
	return reg ? reg.pushManager.getSubscription() : null;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
	const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
		.replace(/-/g, '+')
		.replace(/_/g, '/');
	const raw = atob(base64);
	const bytes = new Uint8Array(new ArrayBuffer(raw.length));
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

async function post(body: Record<string, unknown>): Promise<Response> {
	return fetch('/account/push', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Asks the permission, subscribes this device and registers it. */
export async function enablePush(publicKey: string): Promise<'ok' | 'denied' | 'failed'> {
	try {
		const reg = (await registration()) ?? (await navigator.serviceWorker.ready);
		const permission = await Notification.requestPermission();
		if (permission !== 'granted') return 'denied';
		const sub =
			(await reg.pushManager.getSubscription()) ??
			(await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
		const answer = await post({ action: 'subscribe', subscription: sub.toJSON(), timeZone: timeZone() });
		return answer.ok ? 'ok' : 'failed';
	} catch {
		return 'failed';
	}
}

/** The server forgets this device, then the browser drops its subscription. */
export async function disablePush(): Promise<void> {
	const sub = await currentSubscription();
	if (!sub) return;
	await post({ action: 'unsubscribe', endpoint: sub.endpoint }).catch(() => null);
	await sub.unsubscribe().catch(() => false);
}

/** The id of this device in the account's list, or null when it does not receive the alerts. */
export async function thisDevice(): Promise<string | null> {
	const sub = await currentSubscription();
	if (!sub || Notification.permission !== 'granted') return null;
	const answer = await post({ action: 'status', endpoint: sub.endpoint }).catch(() => null);
	if (!answer?.ok) return null;
	return ((await answer.json()) as { id: string | null }).id;
}

export async function testPush(): Promise<boolean> {
	const sub = await currentSubscription();
	if (!sub) return false;
	const answer = await post({ action: 'test', endpoint: sub.endpoint }).catch(() => null);
	if (!answer?.ok) return false;
	const { sent } = (await answer.json()) as { sent: number };
	return sent > 0;
}
