import { accountsEnabled } from '$lib/server/db';
import type { LayoutServerLoad } from './$types';

// The same for every visitor (public pages are cached): whether this server has accounts, not who is signed in.
export const load: LayoutServerLoad = ({ locals }) => ({ lang: locals.lang, accounts: accountsEnabled() });
