import { defineConfig, devices } from '@playwright/test';

// Test servers. By default the app is built and served with `vite preview` (production bundles):
// fast, deterministic page loads and no dev-server module discovery/reloads mid-test.
// E2E_SERVER=dev uses the Vite dev server instead (handy when debugging).
// Ports never reuse an existing server, so tests cannot attach to a developer's own dev server
// (which might be configured with real Supabase keys). Defaults avoid Vite's usual 5173/4173.
const mode = process.env.E2E_SERVER === 'dev' ? 'dev' : 'preview';
const port = Number(process.env.E2E_PORT ?? 5179);
const onlinePort = Number(process.env.E2E_ONLINE_PORT ?? port + 1);
const baseURL = `http://localhost:${port}`;
const onlineURL = `http://localhost:${onlinePort}`;
// E2E_CHROMIUM_EXECUTABLE: use a specific Chromium binary (set by scripts/e2e-sandbox.sh).
const executablePath = process.env.E2E_CHROMIUM_EXECUTABLE;
const launch = executablePath ? { launchOptions: { executablePath } } : {};
const chrome = { ...devices['Desktop Chrome'], ...launch };

function server(name: string, serverPort: number, env: Record<string, string>) {
  const outDir = `node_modules/.e2e-dist/${name}`;
  return {
    command:
      mode === 'dev'
        ? `npm run dev -- --port ${serverPort} --strictPort`
        : `npx vite build --outDir ${outDir} --emptyOutDir --logLevel warn && npx vite preview --outDir ${outDir} --port ${serverPort} --strictPort`,
    url: `http://localhost:${serverPort}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { ...env, VITE_CACHE_DIR: `node_modules/.vite-e2e-${name}` },
  };
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Generous budgets: scenario tests play whole missions/battles and must not fail on slower machines.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'line' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: [/online\//, /mobile\.spec\.ts/], use: chrome },
    { name: 'mobile', testMatch: /mobile\.spec\.ts/, use: { ...devices['Pixel 5'], ...launch } },
    { name: 'online', testMatch: /online\/.*\.spec\.ts/, use: { ...chrome, baseURL: onlineURL } },
  ],
  webServer: [
    // Always offline, even if a developer's .env.local contains real keys.
    server('offline', port, { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }),
    // Online features pointed at a fake Supabase (mocked per test with page.route).
    server('online', onlinePort, { VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'e2e-anon-key' }),
  ],
});
