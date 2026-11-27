// The home face of the widget page (`/widget?face=home`, what the Windows app shows in its flyout) draws the Home Assistant
// card of vigie-api itself, not a copy rewritten for the site: the card is one file, `vigie-card.js`, that this script copies
// into `static/ha-card/` at a given commit of vigie-api, with the commit and the SHA-256 of the file in
// `src/lib/widget/haCard.ts` (a unit test checks that the two agree). The copy is never edited by hand: a fix goes to
// vigie-api, then the copy is taken again.
//
//   node scripts/sync-ha-card.mjs <commit>                 download the card of that commit (40 hexadecimal characters)
//   node scripts/sync-ha-card.mjs <commit> --from <file>   take it from a local checkout of that commit instead
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REPOSITORY = 'Axellum/vigie-api';
export const CARD_PATH = 'custom_components/vigie/frontend/vigie-card.js';
const root = join(import.meta.dirname, '..');
export const TARGET = join(root, 'static', 'ha-card', 'vigie-card.js');
export const SOURCE = join(root, 'src', 'lib', 'widget', 'haCard.ts');

/** The SHA-256 of some bytes, in hexadecimal. */
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** The module that names the copy: its commit, its digest and the address the page loads it from. */
export function sourceModule(commit, digest) {
	return `// Written by scripts/sync-ha-card.mjs: the copy of the Home Assistant card in static/ha-card/, and where it comes from.
// Do not edit by hand (src/lib/widget/haCard.test.ts checks the copy against it).

/** The card of vigie-api (\`${CARD_PATH}\`) at this commit. */
export const HA_CARD_COMMIT = '${commit}';
/** The SHA-256 of \`static/ha-card/vigie-card.js\`. */
export const HA_CARD_SHA256 = '${digest}';
/** Where the page loads it from; the digest in the query, so that a new copy is never served from an old cache. */
export const HA_CARD_URL = \`/ha-card/vigie-card.js?v=\${HA_CARD_SHA256.slice(0, 12)}\`;
`;
}

async function main(argv) {
	const commit = argv[0] ?? '';
	if (!/^[0-9a-f]{40}$/.test(commit))
		throw new Error('usage: node scripts/sync-ha-card.mjs <commit of 40 hex> [--from <file>]');
	const from = argv[1] === '--from' ? argv[2] : null;
	let bytes;
	if (from) bytes = readFileSync(from);
	else {
		const url = `https://raw.githubusercontent.com/${REPOSITORY}/${commit}/${CARD_PATH}`;
		const response = await fetch(url);
		if (!response.ok) throw new Error(`${url}: ${response.status}`);
		bytes = Buffer.from(await response.arrayBuffer());
	}
	if (!bytes.includes('vigie/card/data')) throw new Error('this does not look like the Vigie card');
	mkdirSync(dirname(TARGET), { recursive: true });
	writeFileSync(TARGET, bytes);
	const digest = sha256(bytes);
	writeFileSync(SOURCE, sourceModule(commit, digest));
	console.log(`static/ha-card/vigie-card.js: ${REPOSITORY}@${commit.slice(0, 7)}, sha256 ${digest}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	main(process.argv.slice(2)).catch((err) => {
		console.error(err.message);
		process.exit(1);
	});
}
