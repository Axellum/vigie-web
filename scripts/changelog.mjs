// Fragments for CHANGELOG.md. A pull request no longer edits that file (two of them added a line at the same
// place and conflicted): it adds one file to changelog.d/, and this script puts the files into the changelog when
// someone wants it (at a release, or whenever the owner asks).
//
// changelog.d/<slug>.<type>.md: one entry. <type> is added, changed, deprecated, removed, fixed or security.
// The file holds one bullet ("- ...", its continuation lines indented by two spaces), no blank line.
//
//   node scripts/changelog.mjs --check                      the fragments are valid and apply (what CI runs)
//   node scripts/changelog.mjs --check --base origin/main   also: this branch did not edit CHANGELOG.md by hand
//   node scripts/changelog.mjs --write                      put them into CHANGELOG.md and delete them
//   node scripts/changelog.mjs --write --release 1.2.0      also close [Unreleased] as the version 1.2.0
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TYPES = ['added', 'changed', 'deprecated', 'removed', 'fixed', 'security'];
const UNRELEASED = '## [Unreleased]';
const root = join(import.meta.dirname, '..');

export class FragmentError extends Error {}

/** The entries of a changelog.d folder, as {type, body, file}, in the order of their names. */
export function readFragments(dir) {
	if (!existsSync(dir)) return [];
	const found = [];
	for (const file of readdirSync(dir).sort()) {
		if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') continue;
		const parts = file.split('.');
		if (parts.length !== 3 || !parts[0] || !TYPES.includes(parts[1])) {
			throw new FragmentError(`${file}: the name must be <slug>.<type>.md, type one of ${TYPES.join(', ')}`);
		}
		const body = readFileSync(join(dir, file), 'utf8')
			.replace(/\r\n/g, '\n')
			.replace(/^\n+|\s+$/g, '');
		if (!body.startsWith('- ')) throw new FragmentError(`${file}: the entry must start with '- '`);
		if (body.split('\n').some((line) => line.trim() === '')) {
			throw new FragmentError(`${file}: no blank line inside an entry`);
		}
		found.push({ type: parts[1], body, file });
	}
	return found;
}

function endOfBlock(lines, start, stops) {
	for (let i = start + 1; i < lines.length; i++) if (stops.some((s) => lines[i].startsWith(s))) return i;
	return lines.length;
}

// Where to insert at the end of lines[start..end): after its last line that is not blank.
function afterLastContent(lines, start, end) {
	let position = end;
	while (position > start + 1 && lines[position - 1].trim() === '') position--;
	return position;
}

/** The text with each entry at the end of its "### Type" of [Unreleased] (the subsection is created where missing). */
export function applyFragments(text, fragments) {
	const lines = text.split('\n');
	const start = lines.indexOf(UNRELEASED);
	if (start < 0) throw new FragmentError(`CHANGELOG.md has no '${UNRELEASED}' heading`);
	for (const type of TYPES) {
		const entries = fragments.filter((f) => f.type === type).flatMap((f) => f.body.split('\n'));
		if (entries.length === 0) continue;
		const heading = `### ${type[0].toUpperCase()}${type.slice(1)}`;
		const end = endOfBlock(lines, start, ['## ']);
		const index = lines.slice(start, end).indexOf(heading);
		if (index >= 0) {
			const at = afterLastContent(lines, start + index, endOfBlock(lines, start + index, ['### ', '## ']));
			lines.splice(at, 0, ...entries);
			continue;
		}
		// A new subsection goes before the first existing one that comes later in the canonical order.
		let before = -1;
		for (let i = start + 1; i < end; i++) {
			const later = lines[i].startsWith('### ') ? TYPES.indexOf(lines[i].slice(4).toLowerCase()) : -1;
			if (later > TYPES.indexOf(type)) {
				before = i;
				break;
			}
		}
		if (before >= 0) lines.splice(before, 0, heading, '', ...entries, '');
		else lines.splice(afterLastContent(lines, start, end), 0, '', heading, '', ...entries);
	}
	return lines.join('\n');
}

/** Close [Unreleased] as [version] - date and open an empty [Unreleased] above it. */
export function release(text, version, date) {
	if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version))
		throw new FragmentError(`'${version}' is not a version (1.2.3)`);
	if (text.includes(`## [${version}]`))
		throw new FragmentError(`CHANGELOG.md already has a section for ${version}`);
	return text.replace(UNRELEASED, `${UNRELEASED}\n\n## [${version}] - ${date}`);
}

/** The problems if this branch edited CHANGELOG.md since it left base. */
export function editedByHand(base) {
	const changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`, '--', 'CHANGELOG.md'], {
		cwd: root,
		encoding: 'utf8'
	});
	return changed.trim()
		? [
				'error: CHANGELOG.md was edited by hand. Add a file to changelog.d/ instead (<slug>.<added|changed|fixed|...>.md, ' +
					'one bullet); only a release or assemble branch edits CHANGELOG.md.'
			]
		: [];
}

function main(argv) {
	const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
	const check = argv.includes('--check');
	const write = argv.includes('--write');
	if (!check && !write) {
		console.error('say --check or --write (see the head of scripts/changelog.mjs)');
		return 2;
	}
	const dir = join(root, 'changelog.d');
	const file = join(root, 'CHANGELOG.md');
	let text;
	let fragments;
	try {
		fragments = readFragments(dir);
		text = applyFragments(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), fragments);
		if (flag('--release'))
			text = release(text, flag('--release'), flag('--date') ?? new Date().toISOString().slice(0, 10));
	} catch (error) {
		if (!(error instanceof FragmentError)) throw error;
		console.error(`error: ${error.message}`);
		return 1;
	}
	let status = 0;
	if (check && flag('--base')) {
		for (const problem of editedByHand(flag('--base'))) {
			console.error(problem);
			status = 1;
		}
	}
	if (check)
		console.log(
			status === 0
				? `${fragments.length} changelog fragment(s) apply cleanly`
				: 'fragments apply, but see above'
		);
	if (write && status === 0) {
		writeFileSync(file, text);
		for (const fragment of fragments) unlinkSync(join(dir, fragment.file));
		console.log(
			'fragments put into CHANGELOG.md and deleted; review `git diff`, then commit on a release/ or assemble/ branch'
		);
	}
	return status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	process.exit(main(process.argv.slice(2)));
