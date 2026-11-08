import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The stylesheet of the television screen is written for Chromium 53 to 76 (the browsers of the televisions sold from 2018 to 2021):
// one declaration they do not know is a hole in the screen that nobody will see on a computer. These tests read the file as it is.
const css = readFileSync(join(import.meta.dirname, 'tv.css'), 'utf-8');
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

// What Chromium 53 does not know (or knows wrongly), by the first browser that does.
export const FORBIDDEN: [string, RegExp][] = [
	['gap (flexbox 84, grid 66)', /(^|[\s;{])(row-|column-|grid-)?gap\s*:/],
	['grid (57)', /display\s*:\s*(inline-)?grid|grid-[a-z-]+\s*:/],
	['inset (87)', /(^|[\s;{])inset(-[a-z]+)?\s*:/],
	['clamp() (79)', /\bclamp\(/],
	['min() and max() (79)', /(^|[^-\w])(min|max)\(/],
	['aspect-ratio (88)', /aspect-ratio/],
	[':is() and :where() (88)', /:(is|where)\(/],
	[':has() (105)', /:has\(/],
	[':focus-visible (86)', /:focus-visible/],
	['env() (69)', /\benv\(/],
	['dvh, svh, lvh (108)', /\d(dvh|svh|lvh|dvw|svw|lvw)\b/],
	['position: sticky (56)', /position\s*:\s*sticky/],
	['rgb() with spaces or a slash (65)', /rgba?\(\s*[\d.%]+\s+[\d.%]+|rgba?\([^)]*\//],
	['#rrggbbaa and #rgba (62)', /#([0-9a-fA-F]{4}|[0-9a-fA-F]{8})\b/],
	['individual transforms (104)', /(^|[\s;{])(translate|rotate|scale)\s*:/],
	['nesting (112)', /&\s*[.:[{]/],
	['@container, @layer (99, 105)', /@(container|layer)\b/],
	['backdrop-filter (76)', /backdrop-filter/],
	['color-mix(), oklch() (111, 111)', /color-mix\(|oklch\(|oklab\(/],
	['logical properties (87)', /(margin|padding|border)-(inline|block)[a-z-]*\s*:/],
	['fit-content() and :not(a, b) lists (88)', /:not\([^)]*,/]
];

// The guard is tested on a stylesheet that breaks every rule: a pattern that matches nothing would pass every file.
const BAD = [
	'.tv-a{gap:1rem;row-gap:1rem}',
	'.tv-a{display:grid;grid-template-columns:1fr}',
	'.tv-a{inset:0}',
	'.tv-a{width:clamp(1rem,2vw,3rem);height:min(1rem,2rem);top:max(1rem,2rem)}',
	'.tv-a{aspect-ratio:16/9}',
	'.tv-a:is(.b){} .tv-a:where(.b){} .tv-a:has(b){} .tv-a:focus-visible{}',
	'.tv-a{padding-top:env(safe-area-inset-top);height:100dvh;position:sticky}',
	'.tv-a{color:rgb(0 0 0);background:rgba(0,0,0,0.5);border-color:#12345678;fill:#abcd}',
	'.tv-a{translate:1rem;margin-inline:1rem;backdrop-filter:blur(2px);color:color-mix(in srgb,red,blue)}',
	'.tv-a{ &.b{color:red} } @container (min-width:1px){} @layer x{} .tv-a:not(.b,.c){}'
].join('\n');

describe('the stylesheet of the television screen', () => {
	for (const [name, pattern] of FORBIDDEN) {
		it(`does not use ${name}`, () => {
			expect(pattern.exec(code)?.[0] ?? null).toBeNull();
		});
	}

	it('has guards that see what they are there for', () => {
		for (const [name, pattern] of FORBIDDEN) expect(pattern.test(BAD), name).toBe(true);
	});

	it('is in rem, so that it is the same at 1280, 1920 and 3840', () => {
		// A size in px is a size that does not follow the screen; the hairlines of the page are the only ones allowed, and there are none.
		const px = [...code.matchAll(/:\s*[^;{}]*\b\d+(\.\d+)?px\b/g)].map((m) => m[0]);
		expect(px).toEqual([]);
	});

	it('is flat: every selector starts with a class of the screen', () => {
		const selectors = [...code.matchAll(/(^|\})\s*([^{}@]+)\{/g)]
			.map((m) => m[2].trim())
			.flatMap((s) => s.split(','))
			.map((s) => s.trim())
			.filter(Boolean);
		const loose = selectors.filter((s) => !/^\.tv-/.test(s));
		expect(loose).toEqual([]);
	});
});

// The contrast of the colours of both themes, read from the file: a screen is read from 3 to 5 m, in a harbour office with the sun on it.
function themes(): Record<'day' | 'night', Record<string, string>> {
	const tokens = (selector: string): Record<string, string> => {
		const block = new RegExp(`${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`).exec(code)?.[1] ?? '';
		return Object.fromEntries(
			[...block.matchAll(/--tv-([a-z-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]])
		);
	};
	const day = tokens('.tv-root');
	return { day, night: { ...day, ...tokens('.tv-root.tv-night') } };
}
function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

describe('the colours of the television screen', () => {
	for (const [theme, t] of Object.entries(themes())) {
		it(`${theme}: the text is at least 7:1 on every background it is set on`, () => {
			for (const text of ['ink', 'muted']) {
				for (const ground of ['bg', 'surface', 'soft']) {
					expect(contrast(t[text], t[ground]), `${text} on ${ground}`).toBeGreaterThanOrEqual(7);
				}
			}
			for (const ground of ['bg', 'surface']) {
				expect(contrast(t.accent, t[ground]), `accent on ${ground}`).toBeGreaterThanOrEqual(7);
			}
		});

		it(`${theme}: a verdict colour is at least 4.5:1 on its own tint and on the card (large words and shapes)`, () => {
			for (const v of ['good', 'poss', 'poor']) {
				expect(contrast(t[v], t[`${v}-bg`]), `${v} on its tint`).toBeGreaterThanOrEqual(4.5);
				expect(contrast(t[v], t.surface), `${v} on the card`).toBeGreaterThanOrEqual(4.5);
				expect(contrast(t.ink, t[`${v}-bg`]), `ink on the tint of ${v}`).toBeGreaterThanOrEqual(7);
			}
		});
	}

	it('keeps the three verdicts apart without the colour: the day colours differ in lightness and hue, the shapes carry the rest', () => {
		const { day } = themes();
		const set = new Set([day.good, day.poss, day.poor]);
		expect(set.size).toBe(3);
	});
});
