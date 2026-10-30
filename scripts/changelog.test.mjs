// Tests of scripts/changelog.mjs: node --test scripts/ (no network, no browser).
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { FragmentError, applyFragments, readFragments, release } from './changelog.mjs';

const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- first
  continued

### Fixed

- a fix

## [1.0.0] - 2026-01-01

### Added

- old
`;

const entry = (type, body) => ({ type, body, file: `x.${type}.md` });

test('an entry goes at the end of its subsection of Unreleased only', () => {
	const out = applyFragments(CHANGELOG, [entry('added', '- second')]);
	assert.ok(out.includes('- first\n  continued\n- second\n\n### Fixed'));
	assert.equal(out.split('- second').length, 2);
	assert.ok(out.endsWith('- old\n'));
});

test('a missing subsection is created in the canonical order', () => {
	const out = applyFragments(CHANGELOG, [entry('changed', '- c'), entry('security', '- s')]);
	const at = (s) => out.indexOf(s);
	assert.ok(at('### Added') < at('### Changed') && at('### Changed') < at('### Fixed'));
	assert.ok(at('### Fixed') < at('### Security') && at('### Security') < at('## [1.0.0]'));
	assert.ok(out.includes('### Security\n\n- s\n\n## [1.0.0]'));
});

test('entries of one subsection keep the order of their names', () => {
	const out = applyFragments(CHANGELOG, [entry('fixed', '- f1'), entry('fixed', '- f2')]);
	assert.ok(out.includes('- a fix\n- f1\n- f2\n\n## [1.0.0]'));
});

test('a changelog without Unreleased is an error', () => {
	assert.throws(() => applyFragments('# Changelog\n', [entry('added', '- x')]), FragmentError);
});

test('a release closes Unreleased and opens a new one', () => {
	const out = release(CHANGELOG, '1.2.0', '2026-11-01');
	assert.ok(out.includes('## [Unreleased]\n\n## [1.2.0] - 2026-11-01\n\n### Added\n\n- first'));
	assert.throws(() => release(CHANGELOG, '1.0.0', '2026-11-01'), FragmentError);
	assert.throws(() => release(CHANGELOG, 'v1', '2026-11-01'), FragmentError);
});

test('a badly named or badly written fragment is refused', () => {
	const dir = mkdtempSync(join(tmpdir(), 'vigie-changelog-'));
	writeFileSync(join(dir, 'x.wrong.md'), '- a\n');
	assert.throws(() => readFragments(dir), FragmentError);
	const other = mkdtempSync(join(tmpdir(), 'vigie-changelog-'));
	writeFileSync(join(other, 'y.added.md'), 'not a bullet\n');
	assert.throws(() => readFragments(other), FragmentError);
	const blank = mkdtempSync(join(tmpdir(), 'vigie-changelog-'));
	writeFileSync(join(blank, 'z.added.md'), '- a\n\n- b\n');
	assert.throws(() => readFragments(blank), FragmentError);
});

test('the real folder applies to the real changelog', () => {
	const real = join(import.meta.dirname, '..');
	const fragments = readFragments(join(real, 'changelog.d'));
	applyFragments(readFileSync(join(real, 'CHANGELOG.md'), 'utf8'), fragments);
});
