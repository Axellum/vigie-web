import type { Lang } from '#lib/i18n.js';

declare global {
	namespace App {
		interface PageState {
			searchedPlace?: { hash: string; label: string };
		}
		interface Locals {
			lang: Lang;
		}
		interface PageData {
			lang: Lang;
		}
	}
}

export {};
