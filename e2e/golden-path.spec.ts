import { expect, test } from '@playwright/test';
import path from 'node:path';

/**
 * Golden path smoke test (plan Phase 8):
 *   add candidate → create position → score displayed → chat query answered.
 *
 * Requires the full stack running (`docker compose up`) with models pulled.
 * Run: pnpm test:e2e (from ./frontend) or npx playwright test (from ./e2e).
 */
test('recruiter golden path', async ({ page }) => {
  await page.goto('/');

  // Dismiss the first-run welcome modal if present
  const skip = page.getByRole('button', { name: /skip for now/i });
  if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await skip.click();
  }

  // 1. Add a candidate from a plain-text resume
  await page.goto('/candidates/add');
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(__dirname, 'fixtures', 'resume-alice.txt'));
  await page.getByRole('button', { name: /upload & process/i }).click();

  // Ingestion: extraction + embedding can take a while on CPU
  await expect(page.getByText(/candidate.* extracted/i)).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: /next/i }).click();
  await page.getByRole('button', { name: /^done$/i }).click();
  await expect(page.getByText('Alice')).toBeVisible();

  // 2. Create a position from a JD
  await page.goto('/positions/new');
  await page.getByLabel('Job description text').fill(
    `Senior Backend Engineer

We need a senior engineer with deep Go and distributed systems experience.
Responsibilities: design microservices, lead architecture reviews, mentor juniors.
Requirements: 5+ years backend, Go, Kubernetes, strong communication. Remote OK.`,
  );
  await page.getByRole('button', { name: /analyze/i }).click();

  // JD extraction (LLM)
  await expect(page.getByText(/review extracted details/i)).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: /next/i }).click();
  await page.getByRole('button', { name: /next/i }).click();
  await page.getByRole('button', { name: /create position/i }).click();

  // 3. Scored candidate appears in the pipeline
  await expect(page.getByText(/candidates \(/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Alice Chen')).toBeVisible({ timeout: 180_000 });

  // 4. Chat query gets an answer
  await page.getByLabel('Chat message').fill('Who are the top candidates for this role?');
  await page.getByRole('button', { name: /^send$/i }).click();
  await expect(page.locator('[data-tour="chat-panel"] .rounded-bl-sm').last()).toBeVisible({
    timeout: 120_000,
  });
});
