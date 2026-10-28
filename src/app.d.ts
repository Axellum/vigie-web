import type { Lang } from '#lib/i18n.js';

declare global {
	namespace App {
		interface Locals {
			lang: Lang;
		}
		interface PageData {
			lang: Lang;
		}
	}
}

export {};
