// End-to-end coverage of the full PaintLead Pro funnel:
// landing page → homeowner visualizer/lead funnel → partner dashboard
// (voice agent + SMS dispatch run in MOCK mode without live keys).
import { test, expect } from '@playwright/test';

test.describe('Landing page', () => {
  test('loads with hero, nav links to both apps', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/PaintLead Pro/i);
    await expect(page.locator('a[href="homeowner.html"]').first()).toBeVisible();
    await expect(page.locator('a[href="dashboard.html"]').first()).toBeVisible();
  });
});

test.describe('Homeowner funnel', () => {
  test('completes full lead capture with AI analysis', async ({ page }) => {
    await page.goto('/homeowner.html');

    // Step 1: pick a Sherwin-Williams color (required to advance)
    await page.evaluate(() => applyColor('Alabaster SW 7008', '#F2EFE9'));
    await page.evaluate(() => nextFunnelStep(2));
    await expect(page.locator('#funnel-step-content-2')).toBeVisible();

    // Step 2 → 3
    await page.evaluate(() => nextFunnelStep(3));
    await expect(page.locator('#funnel-step-content-3')).toBeVisible();

    // Step 3: contact details
    await page.fill('#funnel-address', '408 West Georgia Rd, Greenville, SC');
    await page.fill('#funnel-name', 'E2E Test Homeowner');
    await page.fill('#funnel-phone', '(864) 555-0102');
    await page.fill('#funnel-email', 'e2e@example.com');

    // Submit → calls /api/analyze-surface (mock mode) → step 4 quote sheet
    await page.evaluate(() => submitHomeownerLead());

    // Lead persisted locally (Supabase not configured in test env).
    // Poll: the save happens asynchronously after the AI analysis roundtrip.
    await expect
      .poll(
        () => page.evaluate(() => JSON.parse(localStorage.getItem('paintlead_leads') || '[]').some((l) => l.name === 'E2E Test Homeowner')),
        { timeout: 20_000 }
      )
      .toBe(true);

    // Quote sheet populated with a computed price bracket
    await expect(page.locator('#quote-price-range')).toContainText('$');
    await expect(page.locator('#funnel-step-content-4')).toBeVisible();
  });

  test('validates required contact fields', async ({ page }) => {
    await page.goto('/homeowner.html');
    await page.evaluate(() => applyColor('Alabaster SW 7008', '#F2EFE9'));
    await page.evaluate(() => nextFunnelStep(3));
    await page.evaluate(() => submitHomeownerLead());
    // Stays on step 3 and shows a toast
    await expect(page.locator('#funnel-step-content-3')).toBeVisible();
    await expect(page.locator('.toast-error')).toBeVisible();
  });
});

test.describe('Partner dashboard', () => {
  test('demo login, lead list, voice agent simulation, dispatch', async ({ page }) => {
    await page.goto('/dashboard.html');

    // Demo-mode magic link login (Supabase unconfigured locally)
    await expect(page.locator('#auth-screen')).toBeVisible();
    await page.fill('#auth-email', 'contractor@e2e-test.com');
    await page.click('#auth-form button[type="submit"]');
    await page.click('#auth-proceed-btn');
    await expect(page.locator('#dashboard-panel')).toBeVisible();
    await expect(page.locator('#logged-in-user')).toHaveText('contractor@e2e-test.com');

    // Pre-seeded leads render
    const cards = page.locator('#leads-list-container > div');
    await expect(cards.first()).toBeVisible();
    const initialStat = await page.locator('#stat-total-leads').textContent();
    expect(Number(initialStat)).toBeGreaterThan(0);

    // Select first lead → details panel populates
    // (dispatchEvent avoids pointer-interception flake when CDN CSS is unavailable in CI)
    await cards.first().dispatchEvent('click');
    await expect(page.locator('#selected-lead-card h3').first()).toBeVisible();

    // Voice agent (mock API + scripted dialogue).
    // Accelerate the scripted dialogue timers so the suite stays fast.
    await page.evaluate(() => {
      const origSetInterval = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...args) => origSetInterval(fn, Math.min(ms || 0, 150), ...args);
      const origSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...args) => origSetTimeout(fn, Math.min(ms || 0, 300), ...args);
    });
    const voiceBtn = page.locator('#selected-lead-card button', { hasText: /Voice Agent/i });
    if (await voiceBtn.count()) {
      await voiceBtn.dispatchEvent('click');
      await expect(page.locator('#voice-call-modal')).toBeVisible();
      await page.locator('#voice-action-btn').dispatchEvent('click');
      // Dialogue completes and modal closes itself (asserts on class — CSS-independent)
      await expect(page.locator('#voice-call-modal')).toHaveClass(/hidden/, { timeout: 20_000 });
    }

    // Dispatch to partners (mock Twilio)
    const dispatchBtn = page.locator('#selected-lead-card button', { hasText: /Dispatch Lead/i });
    if (await dispatchBtn.count()) {
      await dispatchBtn.dispatchEvent('click');
      // Lead transitions to Dispatched and the detail panel reflects syndication
      await expect(page.locator('#selected-lead-card')).toContainText(/Syndicated|Dispatched/i, { timeout: 15_000 });
    }

    // Logout returns to auth screen
    await page.locator('text=Logout').dispatchEvent('click');
    await expect(page.locator('#auth-form')).toBeVisible();
  });
});

test.describe('API smoke via HTTP', () => {
  test('all four endpoints respond correctly', async ({ request }) => {
    const cfg = await request.get('/api/config');
    expect(cfg.ok()).toBe(true);

    const analyze = await request.post('/api/analyze-surface', {
      data: { image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', color: 'Alabaster' }
    });
    expect(analyze.ok()).toBe(true);
    expect((await analyze.json()).success).toBe(true);

    const voice = await request.post('/api/voice-agent', { data: { phone: '8645550102', name: 'Smoke Test' } });
    expect(voice.ok()).toBe(true);

    const dispatch = await request.post('/api/dispatch-lead', {
      data: { phone: '8645550102', name: 'Smoke Test', address: '1 Main St' }
    });
    expect(dispatch.ok()).toBe(true);

    // Unknown endpoint 404s
    const missing = await request.post('/api/does-not-exist', { data: {} });
    expect(missing.status()).toBe(404);
  });
});
