import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // Real Chrome: it isolates sandboxed iframes into their own process (the bundled headless shell does not),
  // which is what users run and what the infinite-loop test depends on.
  use: { baseURL: 'http://localhost:5199', ...devices['Desktop Chrome'], channel: 'chrome' },
  webServer: {
    command: 'npm run copy-vendor && npx vite --port 5199 --strictPort', port: 5199, reuseExistingServer: false,
    // placeholder project: shows the optional sign-in UI; tests never reach Supabase
    env: { VITE_SUPABASE_URL: 'https://e2e-placeholder.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e' },
  },
});
