import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// The theme script of src/app.html carries a nonce, and SvelteKit puts that nonce in the Content-Security-Policy only when the page
// has a script of its own to run. A page without client code (the television screens, `csr = false`) has none: the script would be
// blocked, and say so in the console of every screen. Its hash in the policy lets it run there too, and these two must not drift apart.
it('allows the theme script of app.html by its hash', () => {
	const root = join(import.meta.dirname, '..', '..', '..');
	const html = readFileSync(join(root, 'src', 'app.html'), 'utf-8');
	const script = /<script nonce="%sveltekit\.nonce%">([\s\S]*?)<\/script>/.exec(html)?.[1];
	expect(script, 'the theme script of app.html').toBeTruthy();
	const hash = `sha256-${createHash('sha256')
		.update(script as string)
		.digest('base64')}`;
	const config = readFileSync(join(root, 'vite.config.ts'), 'utf-8');
	expect(config, 'script-src of vite.config.ts').toContain(`'${hash}'`);
});
