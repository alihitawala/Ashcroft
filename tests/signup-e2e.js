const { chromium } = require('playwright');
const crypto = require('crypto');

const BASE = 'https://ashcroft.cloud';

(async () => {
  // Setup: create a fresh invite code directly in DB
  const { pool } = require('../server/db');
  const code = crypto.randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();
  const testEmail = `test-${Date.now()}@example.com`;
  const testName = 'E2E Test User';
  const testPassword = 'TestPass123!';

  await pool.query(
    `INSERT INTO invite_codes (code, created_by, household_name, expires_at)
     VALUES ($1, 1, 'E2E Test Household', NOW() + INTERVAL '1 hour')`,
    [code]
  );
  console.log(`✅ Created invite code: ${code}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14 size
    recordVideo: { dir: '/home/ashcroft/www/tests/videos/', size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.log(`  ❌ ${name}`);
      failed++;
    }
  }

  try {
    // ─── TEST 1: Page loads ───
    console.log('\n🧪 Test 1: Signup page loads');
    await page.goto(`${BASE}/app/signup.html`, { waitUntil: 'networkidle' });
    assert(await page.isVisible('.login-card'), 'Signup card visible');
    assert(await page.isVisible('#inviteCode'), 'Invite code input visible');

    // ─── TEST 2: Invalid code shows error ───
    console.log('\n🧪 Test 2: Invalid code shows error');
    await page.fill('#inviteCode', 'BADCODE1');
    await page.waitForTimeout(800); // wait for debounce
    await page.waitForSelector('.invite-status.invalid', { timeout: 5000 });
    const invalidText = await page.textContent('.invite-status.invalid');
    assert(invalidText.includes('Invalid'), 'Shows invalid message');
    // Signup fields should NOT be visible
    const fieldsHidden = !(await page.isVisible('#signupFields'));
    assert(fieldsHidden, 'Signup fields hidden for invalid code');

    // ─── TEST 3: Valid code shows success + fields ───
    console.log('\n🧪 Test 3: Valid code shows fields + button');
    await page.fill('#inviteCode', '');
    await page.fill('#inviteCode', code);
    await page.waitForTimeout(800);
    await page.waitForSelector('.invite-status.valid', { timeout: 5000 });
    const validText = await page.textContent('.invite-status.valid');
    assert(validText.includes('Valid'), 'Shows valid message');
    assert(validText.includes('E2E Test Household'), 'Shows household name');

    // Check that ONLY valid status is showing (not both invalid and valid)
    const invalidVisible = await page.isVisible('.invite-status.invalid');
    assert(!invalidVisible, 'Invalid status NOT showing alongside valid');

    // Fields visible
    assert(await page.isVisible('#signupFields'), 'Signup fields visible');
    assert(await page.isVisible('#name'), 'Name input visible');
    assert(await page.isVisible('#email'), 'Email input visible');
    assert(await page.isVisible('#password'), 'Password input visible');

    // ─── TEST 4: CTA button visible and clickable ───
    console.log('\n🧪 Test 4: Create Account button');
    const btn = page.locator('#signupBtn');
    assert(await btn.isVisible(), 'Create Account button VISIBLE');
    const btnText = await btn.textContent();
    assert(btnText.trim() === 'Create Account', `Button text is "${btnText.trim()}"`);
    // Button should be enabled when code is valid
    const btnDisabled = await btn.getAttribute('disabled');
    assert(btnDisabled === null, 'Button is NOT disabled');

    // ─── TEST 5: Fill form and submit ───
    console.log('\n🧪 Test 5: Complete signup flow');
    await page.fill('#name', testName);
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.waitForTimeout(500); // let user see the filled form

    await btn.click();
    // Should redirect to dashboard on success
    await page.waitForURL('**/dashboard.html', { timeout: 10000 });
    assert(page.url().includes('dashboard.html'), 'Redirected to dashboard');

    // ─── TEST 6: URL param auto-validation ───
    console.log('\n🧪 Test 6: Code from URL param auto-validates');
    // Generate another code for this test
    const code2 = crypto.randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();
    await pool.query(
      `INSERT INTO invite_codes (code, created_by, household_name, expires_at)
       VALUES ($1, 1, 'URL Param Test', NOW() + INTERVAL '1 hour')`,
      [code2]
    );
    // Clear cookies to log out
    await context.clearCookies();
    await page.goto(`${BASE}/app/signup.html?code=${code2}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.invite-status.valid', { timeout: 5000 });
    const codeVal = await page.inputValue('#inviteCode');
    assert(codeVal === code2, 'Code auto-filled from URL');
    assert(await page.isVisible('.invite-status.valid'), 'Auto-validated as valid');
    assert(await page.isVisible('#signupBtn'), 'Button visible after auto-validate');

    // ─── TEST 7: No focus-stealing on code input ───
    console.log('\n🧪 Test 7: No focus stealing while typing code');
    await context.clearCookies();
    await page.goto(`${BASE}/app/signup.html`, { waitUntil: 'networkidle' });
    await page.click('#inviteCode');
    // Type code character by character with delays
    for (const ch of code2) {
      await page.type('#inviteCode', ch, { delay: 100 });
    }
    // Focus should still be on invite code input after typing
    const focusedId = await page.evaluate(() => document.activeElement?.id);
    assert(focusedId === 'inviteCode', `Focus stayed on inviteCode (was: ${focusedId})`);

  } catch (err) {
    console.error(`\n💥 Test crashed: ${err.message}`);
    failed++;
  }

  // Cleanup (order: invite_codes → users → households due to FK constraints)
  const codes = [code];
  try { codes.push(code2); } catch {}
  await pool.query(`DELETE FROM invite_codes WHERE code = ANY($1::text[])`, [codes]);
  await pool.query(`DELETE FROM users WHERE email = $1`, [testEmail]);
  // Don't delete households as other users may reference them — leave for manual cleanup
  // Safe to delete only if empty:
  await pool.query(`DELETE FROM households WHERE name IN ('E2E Test Household', 'URL Param Test') AND id NOT IN (SELECT DISTINCT household_id FROM users WHERE household_id IS NOT NULL)`);

  await page.close();
  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();
  await pool.end();

  console.log(`\n${'═'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (videoPath) console.log(`📹 Video: ${videoPath}`);
  console.log(`${'═'.repeat(40)}\n`);

  process.exit(failed > 0 ? 1 : 0);
})();
