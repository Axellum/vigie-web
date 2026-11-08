import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// The script of the television screen is read as it is by Chromium 53 to 76: ES5, and only what these browsers have. The page that
// runs it (a reading again, the offline state, the clock) is e2e/tv.spec.ts.
const source = readFileSync(join(import.meta.dirname, 'screen.es5.js'), 'utf-8');
const file = ts.createSourceFile('screen.es5.js', source, ts.ScriptTarget.ES5, true, ts.ScriptKind.JS);

// Syntax that came after ES5.
const SYNTAX: [ts.SyntaxKind, string][] = [
	[ts.SyntaxKind.ArrowFunction, 'an arrow function'],
	[ts.SyntaxKind.TemplateExpression, 'a template string'],
	[ts.SyntaxKind.NoSubstitutionTemplateLiteral, 'a template string'],
	[ts.SyntaxKind.SpreadElement, 'a spread'],
	[ts.SyntaxKind.SpreadAssignment, 'a spread'],
	[ts.SyntaxKind.ClassDeclaration, 'a class'],
	[ts.SyntaxKind.ClassExpression, 'a class'],
	[ts.SyntaxKind.ObjectBindingPattern, 'a destructuring'],
	[ts.SyntaxKind.ArrayBindingPattern, 'a destructuring'],
	[ts.SyntaxKind.ForOfStatement, 'for…of'],
	[ts.SyntaxKind.AwaitExpression, 'await'],
	[ts.SyntaxKind.ShorthandPropertyAssignment, 'a shorthand property'],
	[ts.SyntaxKind.ComputedPropertyName, 'a computed property'],
	[ts.SyntaxKind.MethodDeclaration, 'a method shorthand'],
	[ts.SyntaxKind.QuestionQuestionToken, '??'],
	[ts.SyntaxKind.QuestionDotToken, '?.'],
	[ts.SyntaxKind.AsteriskAsteriskToken, '**'],
	[ts.SyntaxKind.BigIntLiteral, 'a BigInt']
];

// What Chromium 53 does not have: a property or a global by its name.
const MISSING_PROPERTIES = [
	'includes',
	'padStart',
	'padEnd',
	'startsWith',
	'endsWith',
	'entries',
	'values',
	'assign',
	'from',
	'find',
	'findIndex',
	'flat',
	'flatMap',
	'fromEntries',
	'matchAll',
	'replaceAll',
	'trimStart',
	'trimEnd',
	'append',
	'prepend',
	'replaceWith',
	'before',
	'after'
];
const MISSING_GLOBALS = [
	'fetch',
	'Promise',
	'Symbol',
	'Map',
	'Set',
	'WeakMap',
	'WeakSet',
	'AbortController',
	'ResizeObserver',
	'globalThis'
];

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
	visit(node);
	ts.forEachChild(node, (child) => walk(child, visit));
}

/** What a script uses that Chromium 53 does not have: its syntax, and the functions and globals it calls. */
function problems(text: string): { syntax: string[]; api: string[] } {
	const sf = ts.createSourceFile('x.js', text, ts.ScriptTarget.ES5, true, ts.ScriptKind.JS);
	const where = (n: ts.Node): string => `line ${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
	const syntax: string[] = [];
	const api: string[] = [];
	walk(sf, (n) => {
		const hit = SYNTAX.find(([kind]) => kind === n.kind);
		if (hit) syntax.push(`${hit[1]} (${where(n)})`);
		if (ts.isVariableDeclarationList(n) && n.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) {
			syntax.push(`let or const (${where(n)})`);
		}
		if (ts.isParameter(n) && (n.initializer || n.dotDotDotToken)) {
			syntax.push(`a default or rest parameter (${where(n)})`);
		}
		if (ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
			syntax.push(`async (${where(n)})`);
		}
		if (ts.isRegularExpressionLiteral(n) && /[suyd]/.test(n.text.slice(n.text.lastIndexOf('/') + 1))) {
			syntax.push(`a regular expression flag (${where(n)})`);
		}
		if (ts.isPropertyAccessExpression(n) && MISSING_PROPERTIES.includes(n.name.text)) {
			api.push(`.${n.name.text} (${where(n)})`);
		}
		if (ts.isIdentifier(n) && MISSING_GLOBALS.includes(n.text) && !ts.isPropertyAccessExpression(n.parent)) {
			api.push(`${n.text} (${where(n)})`);
		}
	});
	return { syntax, api };
}

describe('the script of the television screen', () => {
	it('is valid JavaScript', () => {
		const diagnostics = (file as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics;
		expect(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))).toEqual([]);
	});

	it('uses no syntax newer than ES5, and no function or global that Chromium 53 does not have', () => {
		expect(problems(source)).toEqual({ syntax: [], api: [] });
	});

	it('is checked by a guard that sees what it is there for (the guard is tested on a script that breaks every rule)', () => {
		const bad = [
			'const a = (x) => `${x}`; let b = [...a]; var { c } = b;',
			'class K {} for (var v of b) {} async function f(p = 1, ...r) { await 1; }',
			'var o = { m() {}, [k]: 1, a }; var z = a ?? b?.c; var w = 2 ** 3; var r = /a/s;',
			'fetch(u); new Promise(f); [1].includes(1); "a".padStart(2); Object.entries(o); new Map();'
		].join('\n');
		const { syntax, api } = problems(bad);
		for (const word of [
			'arrow',
			'template',
			'spread',
			'destructuring',
			'class',
			'for…of',
			'await',
			'shorthand property',
			'computed',
			'method shorthand',
			'??',
			'?.',
			'**',
			'let or const',
			'default or rest',
			'async',
			'regular expression flag'
		]) {
			expect(
				syntax.some((s) => s.includes(word)),
				word
			).toBe(true);
		}
		for (const word of ['fetch', 'Promise', '.includes', '.padStart', '.entries', 'Map']) {
			expect(
				api.some((s) => s.includes(word)),
				word
			).toBe(true);
		}
	});

	it('does not touch the network but for one reading of its own page', () => {
		const opens = [...source.matchAll(/\.open\(([^)]*)\)/g)].map((m) => m[1].trim());
		expect(opens).toEqual(["'GET', window.location.href, true"]);
		expect(source).not.toMatch(
			/\bsendBeacon\b|\bWebSocket\b|\bEventSource\b|\bimportScripts\b|\beval\(|new Function/
		);
	});

	it('does not read what the page does not give it: every `data-` attribute is written by the screen', () => {
		const screen = readFileSync(join(import.meta.dirname, 'components', 'Screen.svelte'), 'utf-8');
		const message = readFileSync(join(import.meta.dirname, 'components', 'Message.svelte'), 'utf-8');
		const written = new Set([...(screen + message).matchAll(/\bdata-([a-z]+)=/g)].map((m) => m[1]));
		const read = [...source.matchAll(/attr\('data-([a-z]+)'/g)].map((m) => m[1]);
		expect(read.filter((name) => !written.has(name))).toEqual([]);
	});
});
