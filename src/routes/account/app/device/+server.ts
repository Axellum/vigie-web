import { error, json } from '@sveltejs/kit';
import { VIGIE_MAX_APP_DEVICES } from '$app/env/private';
import {
	AppDeviceError,
	bearer,
	DEFAULT_MAX_APP_DEVICES,
	parseAppDevice,
	registerAppDevice,
	registrations,
	removeAppDevice,
	updateAppDevice
} from '#lib/server/appDevices.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { fcmEnabled } from '#lib/server/fcm.js';
import type { RequestHandler } from './$types';

// The bells of the Android app, without an account (appDevices.ts). JSON, called by the app only:
// POST registers a device and its places and answers its secret, once; PUT changes them and DELETE forgets them,
// both with `Authorization: Bearer <secret>`. Under /account because the site's proxy lets only /account write.
// Every request says `Content-Type: application/json`, even without a body: SvelteKit refuses a write from another
// origin without a type (its CSRF check, as for a form).
const NO_STORE = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' };

function open(): void {
	if (!accountsEnabled() || !fcmEnabled()) error(404, 'The app’s notifications are not open on this server');
}

function maxDevices(): number {
	const value = Number(VIGIE_MAX_APP_DEVICES);
	return Number.isInteger(value) && value >= 0 ? value : DEFAULT_MAX_APP_DEVICES;
}

async function input(request: Request) {
	const parsed = parseAppDevice(await request.json().catch(() => null));
	if (parsed instanceof AppDeviceError) error(400, `Bad request (${parsed.code})`);
	return parsed;
}

function secretOf(request: Request): string {
	const secret = bearer(request.headers.get('authorization'));
	if (!secret) error(401, 'A device secret is expected');
	return secret;
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	open();
	const device = await input(request);
	if (!registrations.take(getClientAddress())) error(429, 'Too many new devices from this address');
	try {
		const secret = await registerAppDevice(await db(), device, maxDevices());
		return json({ secret }, { status: 201, headers: NO_STORE });
	} catch (err) {
		if (err instanceof AppDeviceError && err.code === 'full')
			error(503, 'The server holds all the devices it can');
		throw err;
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	open();
	const secret = secretOf(request);
	const device = await input(request);
	if (!(await updateAppDevice(await db(), secret, device))) error(401, 'Unknown device');
	return json({ ok: true }, { headers: NO_STORE });
};

export const DELETE: RequestHandler = async ({ request }) => {
	open();
	if (!(await removeAppDevice(await db(), secretOf(request)))) error(401, 'Unknown device');
	return json({ ok: true }, { headers: NO_STORE });
};
