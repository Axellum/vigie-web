import { defineConfig, devices } from '@playwright/test';

// The built site (npm run build) runs against e2e/mock-api.mjs: no network, recorded answers only. Its
// accounts use a PostgreSQL in memory (e2e/test-db.mjs). The site is reached as "localhost": a passkey needs
// a host name, not an IP address.
const API_PORT = 18181;
const SITE_PORT = 4174;
const DB_PORT = 15433;
const SITE = `http://localhost:${SITE_PORT}`;
const DATABASE_URL = `postgres://postgres@127.0.0.1:${DB_PORT}/postgres`;

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
			command: 'node build',
			url: `${SITE}/sources`,
			env: {
				PORT: String(SITE_PORT),
				HOST: '127.0.0.1',
				ORIGIN: SITE,
				DATABASE_URL,
				DATABASE_POOL_MAX: '1',
				VIGIE_API_URL: `http://127.0.0.1:${API_PORT}`,
				VIGIE_RATE_LIMIT_PER_MINUTE: '100000'
			},
			reuseExistingServer: !process.env.CI
		}
	]
});
