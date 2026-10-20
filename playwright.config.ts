import { defineConfig, devices } from '@playwright/test';

// The built site (npm run build) runs against e2e/mock-api.mjs: no network, recorded answers only.
const API_PORT = 18181;
const SITE_PORT = 4174;

export default defineConfig({
	testDir: 'e2e',
	timeout: 30_000,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: `http://127.0.0.1:${SITE_PORT}`,
		locale: 'fr-FR',
		timezoneId: 'Europe/Paris'
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['Pixel 7'] } }
	],
	webServer: [
		{
			command: 'node e2e/mock-api.mjs',
			url: `http://127.0.0.1:${API_PORT}/v1/health`,
			env: { MOCK_API_PORT: String(API_PORT) },
			reuseExistingServer: !process.env.CI
		},
		{
			command: 'node build',
			url: `http://127.0.0.1:${SITE_PORT}/sources`,
			env: {
				PORT: String(SITE_PORT),
				HOST: '127.0.0.1',
				ORIGIN: `http://127.0.0.1:${SITE_PORT}`,
				VIGIE_API_URL: `http://127.0.0.1:${API_PORT}`,
				VIGIE_RATE_LIMIT_PER_MINUTE: '100000'
			},
			reuseExistingServer: !process.env.CI
		}
	]
});
