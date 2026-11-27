// The drawings of the widget in the look of the card's home page, as SVG text: the « Lueur » columns of the hours, the days as two
// curves round a band, the icons of the family. Pure (strings from numbers and the page's own words), drawn at the size the page
// measured, as the card draws its own (`static/ha-card/vigie-card.js`: hoursBlock, daysBlock).
import type { Lang } from '../i18n';
import {
	alpha,
	glow,
	r1,
	rainColour,
	tempColour,
	tempScale,
	type BoardPalette,
	type DayColumn,
	type Slot
} from './board';
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

/** The arrow of a wind coming from `fromDeg`, `size` wide, centred on (x, y). */
const arrowAt = (x: number, y: number, size: number, fromDeg: number, colour: string) =>
	`<g transform="translate(${r1(x)},${r1(y)}) scale(${r1((size / 2.2) * 100) / 100}) rotate(${Math.round((fromDeg + 180) % 360)})"><path d="M0 -1 L0.62 0.85 L0 0.42 L-0.62 0.85 Z" fill="${colour}"/></g>`;

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

/** Monotone curve (Fritsch-Carlson), as the card's: never a bump between two points that is not in the data. */
export function smooth(p: { x: number; y: number }[]): string {
	const n = p.length;
	if (n < 2) return n ? `M${r1(p[0].x)} ${r1(p[0].y)}` : '';
	const dx: number[] = [],
		m: number[] = [],
		t = new Array<number>(n).fill(0);
	for (let i = 0; i < n - 1; i++) {
		dx[i] = p[i + 1].x - p[i].x;
		m[i] = (p[i + 1].y - p[i].y) / dx[i];
	}
	t[0] = m[0];
	t[n - 1] = m[n - 2];
	for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
	for (let i = 0; i < n - 1; i++) {
		if (m[i] === 0) {
			t[i] = 0;
			t[i + 1] = 0;
		} else {
			const a = t[i] / m[i],
				b = t[i + 1] / m[i],
				s = a * a + b * b;
			if (s > 9) {
				const k = 3 / Math.sqrt(s);
				t[i] = k * a * m[i];
				t[i + 1] = k * b * m[i];
			}
		}
	}
	let d = `M${r1(p[0].x)} ${r1(p[0].y)}`;
	for (let i = 0; i < n - 1; i++) {
		const h = dx[i] / 3;
		d += ` C${r1(p[i].x + h)} ${r1(p[i].y + t[i] * h)} ${r1(p[i + 1].x - h)} ${r1(p[i + 1].y - t[i + 1] * h)} ${r1(p[i + 1].x)} ${r1(p[i + 1].y)}`;
	}
	return d;
}

/** A horizontal gradient through the colours of some temperatures, a stop in the middle of each column. */
const tempGradient = (P: BoardPalette, id: string, temps: number[], w: number) =>
	`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" x2="${r1(w)}" y1="0" y2="0">` +
	temps
		.map(
			(t, i) => `<stop offset="${r1(((i + 0.5) / temps.length) * 100)}%" stop-color="${tempColour(P, t)}"/>`
		)
		.join('') +
	'</linearGradient>';

const glowGradient = (P: BoardPalette, id: string, sun: number | null, day: boolean) =>
	`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
	glow(P, sun, day)
		.map((s) => `<stop offset="${s.offset}" stop-color="${s.colour}"/>`)
		.join('') +
	'</linearGradient>';

/** The columns of a drawing, tinted by their sun, the first one ringed (now, today). */
function columns(
	P: BoardPalette,
	glows: { sun: number | null; day: boolean }[],
	w: number,
	h: number,
	rx: number
) {
	const cw = w / glows.length;
	let defs = '',
		body = '';
	glows.forEach((g, i) => {
		const id = uid();
		defs += glowGradient(P, id, g.sun, g.day);
		body += `<rect x="${r1(cw * i + 1)}" y="0" width="${r1(Math.max(1, cw - 2))}" height="${r1(h)}" rx="${rx}" fill="url(#${id})"/>`;
	});
	if (glows.length)
		body += `<rect x="1.75" y="0.75" width="${r1(Math.max(1, cw - 3.5))}" height="${r1(h - 1.5)}" rx="${rx - 0.5}" fill="none" stroke="${alpha(P.accent, 0.75)}" stroke-width="1.5"/>`;
	return { defs, body };
}

export type HourRow = 'head' | 'icon' | 'temp' | 'curve' | 'mm' | 'wind' | 'foot';

export interface HoursOptions {
	rows: HourRow[];
	/** Hours per slot: the scale of the rain bars. */
	step: number;
	/** The place's offset from UTC, for the hours written. */
	offsetS: number;
	icon?: number;
	rx?: number;
	stroke?: number;
	/** The size of the temperatures of the curve. */
	tempSize?: number;
}

/**
 * The « Lueur » columns of some slots in a drawing `w` × `h`: from top to bottom the rows asked (the hour, the icon, the temperature
 * or its curve, the rain, the wind, the hour again at the foot). The curve takes the height the other rows leave.
 */
export function hoursSvg(
	P: BoardPalette,
	lang: Lang,
	list: Slot[],
	w: number,
	h: number,
	o: HoursOptions
): string {
	const n = list.length;
	if (!n || w <= 0 || h <= 0) return '';
	const cw = w / n,
		narrow = cw < 30,
		ic = o.icon ?? 22,
		rx = o.rx ?? 8;
	const fixed: Record<HourRow, number> = {
		head: 15,
		icon: ic + 6,
		temp: 18,
		curve: 0,
		mm: 26,
		wind: 16 + (narrow ? 12 : 0),
		foot: 17
	};
	const used = o.rows.reduce((a, r) => a + fixed[r], 0);
	const curveH = Math.max(28, h - used);
	const y: Partial<Record<HourRow, number>> = {};
	let acc = 0;
	for (const r of o.rows) {
		y[r] = acc;
		acc += r === 'curve' ? curveH : fixed[r];
	}
	const cx = (i: number) => cw * (i + 0.5);
	const col = columns(
		P,
		list.map((x) => ({ sun: x.sun, day: x.day })),
		w,
		h,
		rx
	);
	let defs = col.defs,
		s = col.body;
	const hour = (x: Slot) => hourLabel(lang, x.ts, o.offsetS, narrow);
	if (y.head != null)
		list.forEach((x, i) => (s += text(cx(i), y.head! + 12, 11, i === 0 ? P.accent : P.t2, hour(x))));
	if (y.icon != null)
		list.forEach((x, i) => (s += iconSvg(P, x.kind, ic, { x: cx(i), y: y.icon! + fixed.icon / 2 + 1 })));
	if (y.temp != null)
		list.forEach(
			(x, i) => (s += text(cx(i), y.temp! + 14, 13, tempColour(P, x.temp), `${fmt(lang, x.temp)}°`))
		);
	if (y.curve != null) {
		const temps = list.map((x) => x.temp);
		const { low, amp } = tempScale(temps);
		const top = y.curve + 6,
			span = Math.max(4, curveH - 26);
		const pts = temps.map((t, i) => ({ x: cx(i), y: top + span - ((t - low) / amp) * span }));
		const id = uid();
		defs += tempGradient(P, id, temps, w);
		s += `<path d="${smooth(pts)}" fill="none" stroke="url(#${id})" stroke-width="${o.stroke ?? 3.5}" stroke-linecap="round"/>`;
		list.forEach(
			(x, i) =>
				(s += text(pts[i].x, pts[i].y + 18, o.tempSize ?? 13, tempColour(P, x.temp), `${fmt(lang, x.temp)}°`))
		);
	}
	if (y.mm != null)
		list.forEach((x, i) => {
			if (!(x.mm != null && x.mm >= 0.1)) return;
			const top = 2.5 * o.step,
				bh = Math.max(4, Math.sqrt(Math.min(x.mm, top) / top) * 14),
				bw = Math.min(16, cw * 0.66),
				base = y.mm! + 24;
			s += `<rect x="${r1(cx(i) - bw / 2)}" y="${r1(base - bh)}" width="${r1(bw)}" height="${r1(bh)}" rx="3" fill="${rainColour(P, x.mm / o.step)}"/>`;
			s += text(cx(i), base - bh - 3, 10, P.rainLight, fmt(lang, x.mm, x.mm < 10 ? 1 : 0));
		});
	if (y.wind != null)
		list.forEach((x, i) => {
			if (x.wind == null) return;
			const sp = fmt(lang, x.wind),
				a = 10;
			const colour = P.wind;
			if (narrow) {
				if (x.deg != null) s += arrowAt(cx(i), y.wind! + 7, a, x.deg, colour);
				s += text(cx(i), y.wind! + 24, 11.5, colour, sp);
			} else {
				const width = (x.deg != null ? a + 2 : 0) + sp.length * 6.6,
					left = cx(i) - width / 2;
				if (x.deg != null) s += arrowAt(left + a / 2, y.wind! + 8, a, x.deg, colour);
				s += text(left + (x.deg != null ? a + 2 : 0), y.wind! + 12, 12, colour, sp, 700, 'start');
			}
		});
	if (y.foot != null)
		list.forEach((x, i) => (s += text(cx(i), y.foot! + 13, 11, i === 0 ? P.accent : P.t2, hour(x))));
	return `<svg width="${r1(w)}" height="${r1(h)}" viewBox="0 0 ${r1(w)} ${r1(h)}" aria-hidden="true"><defs>${defs}</defs>${s}</svg>`;
}

/**
 * The days in a drawing `w` × `h`: their name and icon, the highest and lowest as two curves round a band, the rain. The curves
 * take the height the other rows leave.
 */
export function daysSvg(
	P: BoardPalette,
	lang: Lang,
	list: DayColumn[],
	w: number,
	h: number,
	icon = 24
): string {
	const n = list.length;
	if (n < 2 || w <= 0 || h <= 0) return '';
	const cw = w / n,
		tight = cw < 50;
	const fixed = { name: 17, icon: icon + 4, rain: 30 };
	const curveH = Math.max(40, h - fixed.name - fixed.icon - fixed.rain);
	const yName = 0,
		yIcon = fixed.name,
		yCurves = yIcon + fixed.icon,
		yRain = yCurves + curveH;
	const cx = (i: number) => cw * (i + 0.5);
	const col = columns(
		P,
		list.map((d) => ({ sun: d.sun, day: true })),
		w,
		h,
		9
	);
	let defs = col.defs,
		s = col.body;
	list.forEach(
		(d, i) => (s += text(cx(i), yName + 14, 12.5, i === 0 ? P.accent : P.text, tight ? d.short : d.name))
	);
	list.forEach((d, i) => (s += iconSvg(P, d.kind, icon, { x: cx(i), y: yIcon + fixed.icon / 2 })));
	const lo = Math.min(...list.map((d) => d.tmin)) - 0.5,
		hi = Math.max(...list.map((d) => d.tmax)) + 0.5;
	const top = yCurves + 19,
		span = Math.max(16, curveH - 38);
	const yOf = (t: number) => top + span - ((t - lo) / (hi - lo)) * span;
	const mx = list.map((d, i) => ({ x: cx(i), y: yOf(d.tmax) })),
		mn = list.map((d, i) => ({ x: cx(i), y: yOf(d.tmin) }));
	const g1 = uid(),
		g2 = uid(),
		band = uid();
	const mean = (k: 'tmax' | 'tmin') => list.reduce((a, d) => a + d[k], 0) / n;
	defs +=
		tempGradient(
			P,
			g1,
			list.map((d) => d.tmax),
			w
		) +
		tempGradient(
			P,
			g2,
			list.map((d) => d.tmin),
			w
		) +
		`<linearGradient id="${band}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${alpha(tempColour(P, mean('tmax')), 0.2)}"/><stop offset="1" stop-color="${alpha(tempColour(P, mean('tmin')), 0.16)}"/></linearGradient>`;
	const back = smooth([...mn].reverse()).replace(/^M/, 'L');
	s += `<path d="${smooth(mx)} ${back} Z" fill="url(#${band})"/>`;
	s += `<path d="${smooth(mx)}" fill="none" stroke="url(#${g1})" stroke-width="3.5" stroke-linecap="round"/>`;
	s += `<path d="${smooth(mn)}" fill="none" stroke="url(#${g2})" stroke-width="2.6" stroke-linecap="round"/>`;
	list.forEach((d, i) => {
		const dot = (p: { x: number; y: number }, t: number) =>
			`<circle cx="${r1(p.x)}" cy="${r1(p.y)}" r="3.4" fill="${P.card}" stroke="${tempColour(P, t)}" stroke-width="2.2"/>`;
		s += dot(mx[i], d.tmax) + dot(mn[i], d.tmin);
		s += text(mx[i].x, mx[i].y - 8, 14, tempColour(P, d.tmax), `${fmt(lang, d.tmax)}°`);
		s += text(mn[i].x, mn[i].y + 17, 12, tempColour(P, d.tmin), `${fmt(lang, d.tmin)}°`, 500);
	});
	list.forEach((d, i) => {
		if (d.mm == null) return;
		const wet = d.mm >= 0.5,
			bh = wet ? Math.max(4, Math.sqrt(Math.min(d.mm, 30) / 30) * 14) : 2,
			bw = Math.min(22, cw * 0.5);
		s += `<rect x="${r1(cx(i) - bw / 2)}" y="${r1(yRain + 15 - bh)}" width="${r1(bw)}" height="${r1(bh)}" rx="${wet ? 3 : 1}" fill="${wet ? rainColour(P, d.mm / 6) : P.hollow}"/>`;
		const words = wet ? `${fmt(lang, d.mm, d.mm < 1 ? 1 : 0)} mm` : lang === 'fr' ? 'sec' : 'dry';
		s += text(cx(i), yRain + 27, 11, wet ? P.rainLight : P.t3, words);
	});
	return `<svg width="${r1(w)}" height="${r1(h)}" viewBox="0 0 ${r1(w)} ${r1(h)}" aria-hidden="true"><defs>${defs}</defs>${s}</svg>`;
}

/** The legend of the glow, a gradient from night to sun (CSS). */
export const glowRamp = (P: BoardPalette) =>
	`linear-gradient(to right,${alpha(P.glowNight, 0.55)} 0%,${alpha(P.glowNight, 0.55)} 22%,${alpha(P.glowCloud, 0.45)} 30%,${alpha(P.glowSun, 0.85)} 100%)`;
