// The QR code of the page of a spot, drawn on the server as one SVG path: the screen needs no script to show it, and a phone
// reads it from a few metres when it is printed large and dark on white. Server only (the library is not sent to a browser).
import qrcode from 'qrcode-generator';

export interface Qr {
	/** The side of the drawing, in modules, quiet zone included. */
	size: number;
	/** One path: a row of dark modules is one rectangle. */
	path: string;
}

/** The quiet zone round the code, in modules: the standard asks for four. */
const QUIET = 4;

export function qrOf(text: string): Qr {
	// Type 0 picks the smallest version that holds the text; the level M survives a few lost modules (glare, a dirty screen).
	const code = qrcode(0, 'M');
	code.addData(text);
	code.make();
	const n = code.getModuleCount();
	let path = '';
	for (let row = 0; row < n; row++) {
		let col = 0;
		while (col < n) {
			if (!code.isDark(row, col)) {
				col++;
				continue;
			}
			let end = col;
			while (end < n && code.isDark(row, end)) end++;
			path += `M${col + QUIET} ${row + QUIET}h${end - col}v1h-${end - col}z`;
			col = end;
		}
	}
	return { size: n + 2 * QUIET, path };
}
