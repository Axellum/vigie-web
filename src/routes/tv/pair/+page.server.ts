import { error } from '@sveltejs/kit';
import { version } from '$app/env';
import type { Lang } from '#lib/i18n.js';
import { SlidingBudget } from '#lib/server/budget.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { publicOrigin } from '#lib/server/origin.js';
import {
	PAIR_COOKIE,
	PAIR_TTL_MS,
	decodePairCookie,
	encodePairCookie,
	resumePairing,
	startPairing
} from '#lib/server/tvPairing.js';
import { parseTvParams, TV_DEFAULTS, type TvParams } from '#lib/tv/params.js';
import { qrOf, type Qr } from '#lib/tv/qr.js';
import type { PageServerLoad } from './$types';

export interface PairPageData {
	mode: 'pair' | 'disabled';
	lang: Lang;
	build: string;
	params: TvParams;
	code: string | null;
	qr: Qr | null;
	accountUrl: string;
	querySuffix: string;
}

const pairCreateBudgets = new Map<string, SlidingBudget>();
const CREATE_LIMIT_PER_5M = 20;
const CREATE_WINDOW_MS = 5 * 60_000;

function allowCreate(address: string): boolean {
	if (pairCreateBudgets.size > 5000) {
		for (const [k, b] of pairCreateBudgets) {
			if (b.used() === 0) pairCreateBudgets.delete(k);
		}
	}
	let budget = pairCreateBudgets.get(address);
	if (!budget) {
		budget = new SlidingBudget(CREATE_LIMIT_PER_5M, CREATE_WINDOW_MS);
		pairCreateBudgets.set(address, budget);
	}
	return budget.take();
}

function querySuffix(params: TvParams): string {
	const parts: string[] = [];
	if (params.theme !== TV_DEFAULTS.theme) parts.push(`theme=${params.theme}`);
	if (params.seconds !== TV_DEFAULTS.seconds) parts.push(`d=${params.seconds}`);
	if (params.refreshSeconds !== TV_DEFAULTS.refreshSeconds) parts.push(`r=${params.refreshSeconds}`);
	if (params.reloadHours !== TV_DEFAULTS.reloadHours) parts.push(`reload=${params.reloadHours}`);
	return parts.length ? `?${parts.join('&')}` : '';
}

export const load: PageServerLoad = async ({
	cookies,
	url,
	locals,
	getClientAddress,
	setHeaders
}): Promise<PairPageData> => {
	const lang = locals.lang;
	const params = parseTvParams(url.searchParams);
	setHeaders({
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex, nofollow'
	});
	const origin = publicOrigin() || url.origin;
	const base = {
		lang,
		build: version,
		params,
		accountUrl: `${origin}/me`,
		querySuffix: querySuffix(params)
	};
	if (!accountsEnabled()) {
		return { ...base, mode: 'disabled', code: null, qr: null };
	}

	const sql = await db();
	const cookie = decodePairCookie(cookies.get(PAIR_COOKIE));
	let session = cookie ? await resumePairing(sql, cookie.waitToken, cookie.rawCode) : null;
	if (!session) {
		if (!allowCreate(getClientAddress())) {
			error(429, 'Too many pairing requests. Try again in a few minutes.');
		}
		session = await startPairing(sql);
		cookies.set(PAIR_COOKIE, encodePairCookie(session), {
			path: '/tv/pair',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: Math.floor(PAIR_TTL_MS / 1000)
		});
	}

	return {
		...base,
		mode: 'pair',
		code: session.code,
		qr: qrOf(`${origin}/me#pair=${session.code}`)
	};
};
