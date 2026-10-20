// Creates an invitation and prints its link (the code is shown once and only its SHA-256 is stored).
// Run where the site's database is reachable, with the site's settings, e.g. in the site's container:
//   podman exec vigie-web node scripts/invite.mjs "for Marie"
//   podman exec vigie-web node scripts/invite.mjs --recover <account id> "lost her phone"
//   podman exec vigie-web node scripts/invite.mjs --list
// A recovery invitation adds a passkey to an existing account instead of creating one; --list gives the ids.
import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';

const DAYS = 7;
const args = process.argv.slice(2);
const list = args[0] === '--list';
let userId = null;
if (args[0] === '--recover') {
	userId = args[1];
	args.splice(0, 2);
	if (!/^[0-9a-f-]{36}$/.test(userId ?? ''))
		throw new Error('usage: invite.mjs --recover <account id> [note]');
}
const note = args.join(' ').trim() || null;
const { DATABASE_URL, ORIGIN } = process.env;
if (!DATABASE_URL || !ORIGIN) throw new Error('DATABASE_URL and ORIGIN must be set (the site settings)');

const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
try {
	if (list) {
		const users = await sql`select id, name, created_at, last_seen_at from users order by created_at`;
		for (const u of users)
			console.log(
				`${u.id}  ${u.name}  created ${u.created_at.toISOString()}  seen ${u.last_seen_at.toISOString()}`
			);
		console.log(`${users.length} account(s)`);
		process.exit(0);
	}
	if (userId) {
		const [user] = await sql`select name from users where id = ${userId}`;
		if (!user) throw new Error(`no account ${userId}`);
		console.log(`recovery for: ${user.name}`);
	}
	const code = randomBytes(18).toString('base64url');
	const expires = new Date(Date.now() + DAYS * 86_400_000);
	await sql`insert into invitations (code_hash, note, user_id, expires_at)
		values (${createHash('sha256').update(code).digest()}, ${note}, ${userId}, ${expires})`;
	console.log(`${ORIGIN.replace(/\/$/, '')}/join/${code}`);
	console.log(`valid until ${expires.toISOString()}, once`);
} finally {
	await sql.end();
}
