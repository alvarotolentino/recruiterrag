import { defineConfig } from '@playwright/test';

// Smoke test against a running stack: `docker compose up`, then `pnpm test:e2e`.
export default defineConfig({
  testDir: '.',
  timeout: 180_000, // LLM steps are slow on CPU
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
  },
});
