// The drawings of the small widget in the look of the card's home page, as SVG text: the « Lueur » columns of its frise and the
// icons of the family. Pure (strings from numbers and the page's own words), drawn at the size the page measured, as the card draws
// its own (`static/ha-card/vigie-card.js`: hoursBlock, daysBlock).
import type { Lang } from '../i18n';
import { glow, r1, tempColour, type BoardPalette, type FriseColumn } from './board';
import { ICON_BOX, ICON_ROLE, ICONS, type IconKind } from './familyIcons';

let seq = 0;
/** Ids of their own for the gradients and masks of each drawing: several drawings share the page. */
const uid = () => `vb${(seq = (seq + 1) % 1e9)}`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A number as the page writes it: a comma in French. */
export const fmt = (lang: Lang, v: number | null, digits = 0) => {
	if (v == null) return '–';
	const s = (Math.round(v * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/\.0+$/, '');
	return lang === 'fr' ? s.replace('.', ',') : s;
};

/** The hour of an instant at the place: `15 h` (`15:00`), or `15` alone for a narrow column. */
export function hourLabel(lang: Lang, ts: number, offsetS: number, bare = false): string {
	const d = new Date((ts + offsetS) * 1000);
	const h = d.getUTCHours();
	if (bare) return `${h}`;
	if (lang === 'en') return `${String(h).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
	const m = d.getUTCMinutes();
	return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** An icon of the family, coloured by the palette, `size` wide; inside a drawing when `at` gives its centre. */
export function iconSvg(
	P: BoardPalette,
	kind: IconKind | null,
	size: number,
	at?: { x: number; y: number }
): string {
	if (!kind) return '';
	const id = uid();
	const body = ICONS[kind]
		.replace(
			/ class="(v[a-z])"/g,
			(m, role: keyof typeof ICON_ROLE) => `${m} color="${P.icon[ICON_ROLE[role]]}"`
		)
		.replaceAll('@', `${id}-`);
	const place = at ? ` x="${r1(at.x - size / 2)}" y="${r1(at.y - size / 2)}"` : '';
	return `<svg${place} width="${size}" height="${size}" viewBox="${ICON_BOX}" fill="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

const text = (
	x: number,
	y: number,
	size: number,
	colour: string,
	words: string,
	weight = 700,
	anchor = 'middle',
	extra = ''
) =>
	`<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" font-weight="${weight}" fill="${colour}" text-anchor="${anchor}"${extra}>${esc(words)}</text>`;

const glowGradient = (P: BoardPalette, id: string, sun: number | null, day: boolean) =>
	`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
	glow(P, sun, day)
		.map((s) => `<stop offset="${s.offset}" stop-color="${s.colour}"/>`)
		.join('') +
	'</linearGradient>';

export interface FriseOptions {
	/** The place's offset from UTC, for the hours written. */
	offsetS: number;
	icon?: number;
	/** The size of the temperatures; the labels and the rain are a little smaller. */
	temp?: number;
	label?: number;
}

/**
 * The columns of the frise in a drawing `w` × `h` (the sketch's `colsMini`): the hour or the day, its icon, its temperature (the
 * highest over the lowest for a narrow day, side by side otherwise), and under the temperature of an hour its rain when there is
 * room. No ring: the box of the hour before them is « now ».
 */
export function friseSvg(
	P: BoardPalette,
	lang: Lang,
	list: FriseColumn[],
	w: number,
	h: number,
	o: FriseOptions
): string {
	const n = list.length;
	if (!n || w <= 0 || h <= 0) return '';
	const cw = w / n,
		ic = o.icon ?? 19,
		ts = o.temp ?? 13,
		ls = o.label ?? 10.5;
	const yLab = ls + 2,
		yIcon = yLab + 3 + ic / 2,
		yTemp = Math.min(h - 4, yIcon + ic / 2 + ts + 1);
	const room = h - yTemp >= ts - 1;
	let defs = '',
		s = '';
	list.forEach((x, i) => {
		const id = uid(),
			cx = cw * (i + 0.5);
		defs += glowGradient(P, id, x.sun, x.day);
		s += `<rect x="${r1(cw * i + 1)}" y="0" width="${r1(Math.max(1, cw - 2))}" height="${r1(h)}" rx="6" fill="url(#${id})"/>`;
		const label = x.name ?? (x.ts != null ? hourLabel(lang, x.ts, o.offsetS, cw < 26) : '');
		s += text(cx, yLab, ls, P.t2, label);
		s += iconSvg(P, x.kind, ic, { x: cx, y: yIcon });
		const high = `${fmt(lang, x.high)}°`;
		if (x.low == null) {
			s += text(cx, yTemp, ts, tempColour(P, x.high), high);
			if (room && x.mm != null && x.mm >= 0.1)
				s += text(cx, yTemp + ts - 0.5, ts - 3, P.rainLight, fmt(lang, x.mm, x.mm < 10 ? 1 : 0));
		} else if (room && cw < 46) {
			s += text(cx, yTemp, ts, tempColour(P, x.high), high);
			s += text(cx, yTemp + ts - 1, ts - 2.5, tempColour(P, x.low), `${fmt(lang, x.low)}°`, 500);
		} else
			s += `<text x="${r1(cx)}" y="${r1(yTemp)}" text-anchor="middle" font-weight="700"><tspan font-size="${ts}" fill="${tempColour(P, x.high)}">${esc(high)}</tspan><tspan font-size="${ts - 2.5}" font-weight="500" fill="${tempColour(P, x.low)}" dx="2">${esc(`${fmt(lang, x.low)}°`)}</tspan></text>`;
	});
	return `<svg width="${r1(w)}" height="${r1(h)}" viewBox="0 0 ${r1(w)} ${r1(h)}" aria-hidden="true"><defs>${defs}</defs>${s}</svg>`;
}
