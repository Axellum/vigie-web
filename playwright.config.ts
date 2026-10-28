import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import webpush from 'web-push';

// The built site (npm run build) runs against e2e/mock-api.mjs: no network, recorded answers only. Its
// accounts use a PostgreSQL in memory (e2e/test-db.mjs). The site is reached as "localhost": a passkey needs
// a host name, not an IP address. Its notifications go to e2e/mock-push.mjs, signed with keys made for the run:
// the VAPID pair for Web Push, and a service account for Firebase Cloud Messaging (the mock is FCM too).
const API_PORT = 18181;
const PUSH_PORT = 18282;
const SITE_PORT = 4174;
const DB_PORT = 15433;
const SITE = `http://localhost:${SITE_PORT}`;
const DATABASE_URL = `postgres://postgres@127.0.0.1:${DB_PORT}/postgres`;
const VAPID = webpush.generateVAPIDKeys();
const FCM_ACCOUNT = join(mkdtempSync(join(tmpdir(), 'vigie-e2e-')), 'fcm-service-account.json');
writeFileSync(
	FCM_ACCOUNT,
	JSON.stringify({
		type: 'service_account',
		project_id: 'vigie-e2e',
		client_email: 'push@vigie-e2e.iam.gserviceaccount.com',
		private_key: generateKeyPairSync('rsa', { modulusLength: 2048 })
			.privateKey.export({ type: 'pkcs8', format: 'pem' })
			.toString(),
		token_uri: `http://127.0.0.1:${PUSH_PORT}/token`
	})
);

export default defineConfig({
	testDir: 'e2e',
	timeout: 30_000,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: SITE,
		locale: 'fr-FR',
		timezoneId: 'Europe/Paris'
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /accounts\.spec/ },
		{ name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: /accounts\.spec/ },
		// The test database runs one PostgreSQL session for all its connections: the account tests, the only
		// ones that write to it, run one at a time, in one browser.
		{ name: 'accounts', use: { ...devices['Desktop Chrome'] }, testMatch: /accounts\.spec/ }
	],
	webServer: [
		{
			command: 'node e2e/test-db.mjs',
			port: DB_PORT,
			env: { TEST_DB_PORT: String(DB_PORT) },
			reuseExistingServer: !process.env.CI
		},
		{
			command: 'node e2e/mock-api.mjs',
			url: `http://127.0.0.1:${API_PORT}/v1/health`,
			env: { MOCK_API_PORT: String(API_PORT) },
			reuseExistingServer: !process.env.CI
		},
		{
			command: 'node e2e/mock-push.mjs',
			url: `http://127.0.0.1:${PUSH_PORT}/`,
			env: { MOCK_PUSH_PORT: String(PUSH_PORT) },
			reuseExistingServer: !process.env.CI
		},
		{
			command: 'node build',
			url: `${SITE}/sources`,
			env: {
				PORT: String(SITE_PORT),
				HOST: '127.0.0.1',
				PROTOCOL_HEADER: 'x-forwarded-proto',
				ORIGIN: SITE,
				DATABASE_URL,
				DATABASE_POOL_MAX: '1',
				VIGIE_API_URL: `http://127.0.0.1:${API_PORT}`,
				VIGIE_RATE_LIMIT_PER_MINUTE: '100000',
				VIGIE_VAPID_PUBLIC_KEY: VAPID.publicKey,
				VIGIE_VAPID_PRIVATE_KEY: VAPID.privateKey,
				VIGIE_VAPID_SUBJECT: 'mailto:vigie@example.org',
				VIGIE_PUSH_EXTRA_HOSTS: `127.0.0.1:${PUSH_PORT}`,
				VIGIE_FCM_SERVICE_ACCOUNT: FCM_ACCOUNT,
				VIGIE_FCM_BASE_URL: `http://127.0.0.1:${PUSH_PORT}`,
				VIGIE_MATCH_INTERVAL_S: '5'
			},
			reuseExistingServer: !process.env.CI
		}
	]
});
